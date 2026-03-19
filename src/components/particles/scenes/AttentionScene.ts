/**
 * AttentionScene — "100 tokens, seuls 5 comptent — le reste est ignoré"
 *
 * Phase 1 (0-30%): ~80 particles all same size/opacity
 * Phase 2 (30-70%): K particles illuminate (size ×2, glow, cyan), connections appear
 * Phase 3 (70-100%): K form fully-connected graph, rest nearly invisible
 * Counter: "K pertinents · N-K ignorés"
 */

import type { ParticleScene } from './types';
import { smoothstep, lerp } from './types';
import {
  ParticlePool,
  ParticleEngine,
  NoiseForce,
  DragForce,
  BoundaryForce,
  TAU,
} from '../engine';
import type { Particle } from '../engine/types';
import { renderGlowDot, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

export interface AttentionData {
  totalTokens?: number;
  relevantCount?: number;
}

const DEFAULT_TOTAL = 80;
const DEFAULT_K = 5;
const MAX_CAPACITY = 100;

/**
 * Simplified softmax: normalize scores so top-K dominate.
 * Returns normalized 0..1 scores per particle.
 */
function computeAttentionScores(total: number, k: number, temperature: number): number[] {
  const scores: number[] = [];
  let sumExp = 0;

  for (let i = 0; i < total; i++) {
    // Relevant particles get score 1.0, rest get random 0..0.1
    const raw = i < k ? 1.0 : Math.random() * 0.1;
    const exp = Math.exp(raw / temperature);
    scores.push(exp);
    sumExp += exp;
  }

  // Normalize
  for (let i = 0; i < total; i++) {
    scores[i] /= sumExp;
  }

  return scores;
}

export class AttentionScene implements ParticleScene {
  readonly name = 'attention';
  readonly title = 'ATTENTION';
  readonly description = '100 tokens, seuls 5 comptent — le reste est ignoré';

  private pool!: ParticlePool;
  private engine!: ParticleEngine;
  private noise!: NoiseForce;
  private boundary!: BoundaryForce;
  private w = 0;
  private h = 0;
  private progress = 0;
  private total: number;
  private k: number;
  private attentionScores: number[] = [];
  private initialized = false;

  constructor(data?: AttentionData) {
    this.total = data?.totalTokens ?? DEFAULT_TOTAL;
    this.k = data?.relevantCount ?? DEFAULT_K;
  }

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;

    this.pool = new ParticlePool(MAX_CAPACITY);
    this.engine = new ParticleEngine(this.pool, 0.97);

    this.noise = new NoiseForce({ frequency: 0.008, amplitude: 25, speed: 0.3 });
    const drag = new DragForce({ coefficient: 2.5 });
    this.boundary = new BoundaryForce({
      left: 15,
      right: width - 15,
      top: 55,
      bottom: height - 55,
      bounce: 0.3,
    });

    this.engine.addForce(this.noise);
    this.engine.addForce(drag);
    this.engine.addForce(this.boundary);

    // Pre-compute attention scores (softmax, temperature=0.5)
    this.attentionScores = computeAttentionScores(this.total, this.k, 0.5);

    this.spawnParticles();
    this.initialized = true;
  }

  private spawnParticles(): void {
    this.pool.reset();
    const { w, h, total, k } = this;

    for (let i = 0; i < total; i++) {
      this.pool.spawn({
        x: w * 0.1 + Math.random() * w * 0.8,
        y: h * 0.15 + Math.random() * h * 0.7,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        size: 3,
        opacity: 0.5,
        color: '#ffffff',
        maxLife: 99999,
        group: i < k ? 1 : 0, // 1 = relevant, 0 = noise
        mass: i, // abuse mass to store particle index for score lookup
      });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.boundary.right = width - 15;
    this.boundary.bottom = height - 55;
    this.spawnParticles();
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    if (!this.initialized) return;

    // attention_phase = smoothstep(0.2, 0.6, progress)
    const attPhase = smoothstep(0.2, 0.6, progress);
    const cx = this.w / 2;
    const cy = this.h / 2;

    this.pool.forEachActive((p: Particle) => {
      const idx = Math.round(p.mass); // particle index
      const score = this.attentionScores[idx] ?? 0;

      if (p.group === 1) {
        // Relevant: attract toward center cluster
        if (attPhase > 0.05) {
          const dx = cx - p.x;
          const dy = cy - p.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(Math.max(distSq, 1));
          const strength = 400 * attPhase;
          const f = strength / Math.max(distSq, 200);
          p.ax += (f * dx) / dist;
          p.ay += (f * dy) / dist;
        }

        // particle_i.opacity = lerp(0.5, normalized_i, attention_phase)
        // particle_i.size = lerp(3, 3 + normalized_i * 8, attention_phase)
        p.opacity = lerp(0.5, Math.max(score * this.total, 0.9), attPhase);
        p.size = lerp(3, 3 + score * this.total * 8, attPhase);
        p.color = attPhase > 0.3 ? '#22d3ee' : '#ffffff';
      } else {
        // Noise: fade + shrink based on low score
        p.opacity = lerp(0.5, Math.max(score * this.total, 0.08), attPhase);
        p.size = lerp(3, Math.max(1.5, 2 * score * this.total), attPhase);
        p.color = '#ffffff';
      }
    });

    // Noise amplitude decreases as attention focuses
    this.noise.amplitude = lerp(25, 6, attPhase);

    this.engine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) return;

    const { pool, progress, k, total, attentionScores } = this;
    const attPhase = smoothstep(0.2, 0.6, progress);

    // ── Connections between relevant particles (fully connected) ──
    if (attPhase > 0.1) {
      const relevant: Array<{ p: Particle; score: number }> = [];
      pool.forEachActive((p: Particle) => {
        if (p.group === 1) {
          const idx = Math.round(p.mass);
          relevant.push({ p, score: attentionScores[idx] ?? 0 });
        }
      });

      for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
          // line_width = 1 + normalized_i * normalized_j * 2
          const w =
            1 +
            relevant[i].score *
              total *
              (relevant[j].score * total) *
              2;
          renderLine(
            ctx,
            relevant[i].p.x,
            relevant[i].p.y,
            relevant[j].p.x,
            relevant[j].p.y,
            attPhase * 0.4,
            Math.min(w, 3),
            'rgba(34,211,238,1)',
          );
        }
      }
    }

    // ── Dim particles (noise tokens) ──
    ctx.save();
    pool.forEachActive((p: Particle) => {
      if (p.group === 0) {
        if (p.opacity <= 0.01) return;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    });
    ctx.restore();

    // ── Bright particles (relevant tokens, with glow) ──
    pool.forEachActive((p: Particle) => {
      if (p.group === 1) {
        renderGlowDot(ctx, p.x, p.y, p.size, p.opacity, '#22d3ee', 12);
      }
    });

    // ── Title ──
    renderTitle(ctx, this.title, width, 0.5);

    // ── Token count label (early phase) ──
    if (progress < 0.25) {
      const op =
        smoothstep(0, 0.05, progress) * (1 - smoothstep(0.15, 0.25, progress));
      renderLabel(ctx, {
        text: `${total} TOKENS`,
        x: width / 2,
        y: height - 30,
        opacity: op * 0.5,
        size: 11,
        align: 'center',
      });
    }

    // ── Counter (late phase): "K pertinents · N-K ignorés" ──
    // counter_opacity = smoothstep(0.5, 0.7, progress)
    const counterOpacity = smoothstep(0.5, 0.7, progress);
    if (counterOpacity > 0.01) {
      const ignored = total - k;
      renderLabel(ctx, {
        text: `${k} PERTINENTS \u00B7 ${ignored} IGNOR\u00C9S`,
        x: width / 2,
        y: height - 30,
        opacity: counterOpacity * 0.6,
        size: 11,
        color: '#22d3ee',
        align: 'center',
      });
    }
  }

  dispose(): void {
    if (this.pool) this.pool.reset();
    this.attentionScores = [];
    this.initialized = false;
  }

  setData(data: unknown): void {
    const d = data as AttentionData;
    if (d) {
      if (d.totalTokens != null) this.total = d.totalTokens;
      if (d.relevantCount != null) this.k = d.relevantCount;
      if (this.initialized) {
        this.attentionScores = computeAttentionScores(this.total, this.k, 0.5);
        this.spawnParticles();
      }
    }
  }
}
