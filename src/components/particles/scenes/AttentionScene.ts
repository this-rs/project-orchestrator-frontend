/**
 * AttentionScene — Impact visualization with real data.
 *
 * Consumes AttentionData from the adapter (real file names, impact scores).
 * Each relevant file = a bright cyan particle with label tooltip.
 * Ignored files = dim white particles in the background.
 *
 * Phase 1 (0-30%): all particles same size, scattered
 * Phase 2 (30-70%): relevant particles illuminate (size grows, glow, cyan), connections appear
 * Phase 3 (70-100%): relevant form cluster, noise fades, counter shows
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

// ── Data types (compatible with adapter output) ─────────────

export interface AttentionToken {
  label: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface AttentionData {
  totalTokens?: number;
  relevantCount?: number;
  // Rich adapter format
  relevantTokens?: AttentionToken[];
  ignoredCount?: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_CAPACITY = 150;
const MAX_RELEVANT_SIZE = 8;  // max pixel radius for relevant particles
const MIN_RELEVANT_SIZE = 4;  // min pixel radius for relevant particles
const BASE_SIZE = 2.5;        // default particle size
const NOISE_SIZE = 1.5;       // size of noise particles when faded

export class AttentionScene implements ParticleScene {
  readonly name = 'attention';
  readonly title = 'IMPACT ANALYSIS';
  readonly description = 'Affected files highlighted — hover for details';

  private pool!: ParticlePool;
  private engine!: ParticleEngine;
  private noise!: NoiseForce;
  private boundary!: BoundaryForce;
  private w = 0;
  private h = 0;
  private progress = 0;
  private initialized = false;

  // Real data
  private tokens: Array<{ label: string; score: number; metadata: Record<string, unknown> }> = [];
  private relevantCount = 0;
  private totalCount = 0;
  private ignoredCount = 0;

  constructor(data?: AttentionData) {
    if (data) this.parseData(data);
  }

  private parseData(data: AttentionData): void {
    if (data.relevantTokens && data.relevantTokens.length > 0) {
      // Rich adapter format — use real data
      this.tokens = data.relevantTokens.map((t) => ({
        label: t.label,
        score: Math.max(0, Math.min(1, t.score)), // clamp 0-1
        metadata: t.metadata ?? {},
      }));
      this.relevantCount = this.tokens.length;
      this.totalCount = data.totalTokens ?? this.relevantCount;
      this.ignoredCount = data.ignoredCount ?? Math.max(0, this.totalCount - this.relevantCount);
    } else {
      // Legacy format — generate synthetic tokens
      this.totalCount = data.totalTokens ?? 40;
      this.relevantCount = data.relevantCount ?? Math.min(5, this.totalCount);
      this.ignoredCount = this.totalCount - this.relevantCount;
      this.tokens = [];
      for (let i = 0; i < this.relevantCount; i++) {
        this.tokens.push({
          label: `Token ${i + 1}`,
          score: 1 - i * (0.8 / Math.max(1, this.relevantCount)),
          metadata: {},
        });
      }
    }

    // Cap total particles for performance
    if (this.totalCount > MAX_CAPACITY) {
      const ratio = MAX_CAPACITY / this.totalCount;
      this.ignoredCount = Math.floor(this.ignoredCount * ratio);
      this.totalCount = this.relevantCount + this.ignoredCount;
    }
  }

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;

    this.pool = new ParticlePool(MAX_CAPACITY);
    this.engine = new ParticleEngine(this.pool, 0.97);

    this.noise = new NoiseForce({ frequency: 0.008, amplitude: 20, speed: 0.3 });
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

    this.spawnParticles();
    this.initialized = true;
  }

  private spawnParticles(): void {
    this.pool.reset();
    const { w, h } = this;

    // Spawn relevant particles (group 1) — with real data
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      this.pool.spawn({
        x: w * 0.15 + Math.random() * w * 0.7,
        y: h * 0.15 + Math.random() * h * 0.7,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        size: BASE_SIZE,
        opacity: 0.5,
        color: '#ffffff',
        maxLife: 99999,
        group: 1,
        mass: i, // index into this.tokens for score/metadata lookup
        metadata: {
          label: token.label,
          name: token.label,
          filePath: token.metadata.filePath,
          impactScore: token.score,
          isDirect: token.metadata.isDirect,
          ...token.metadata,
        },
      });
    }

    // Spawn noise/ignored particles (group 0)
    for (let i = 0; i < this.ignoredCount; i++) {
      this.pool.spawn({
        x: w * 0.05 + Math.random() * w * 0.9,
        y: h * 0.1 + Math.random() * h * 0.8,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: BASE_SIZE,
        opacity: 0.4,
        color: '#ffffff',
        maxLife: 99999,
        group: 0,
        mass: this.tokens.length + i,
        metadata: {
          label: `Background file ${i + 1}`,
          name: `ignored-${i}`,
        },
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

  update(dt: number, progress: number, _time: number): void {
    this.progress = progress;
    if (!this.initialized) return;

    const attPhase = smoothstep(0.2, 0.6, progress);
    const cx = this.w / 2;
    const cy = this.h / 2;

    this.pool.forEachActive((p: Particle) => {
      if (p.group === 1) {
        // Relevant particle — use real score for sizing
        const idx = Math.round(p.mass);
        const score = this.tokens[idx]?.score ?? 0.5;

        // Attract toward center cluster as attention focuses
        if (attPhase > 0.05) {
          const dx = cx - p.x;
          const dy = cy - p.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(Math.max(distSq, 1));
          const strength = 350 * attPhase;
          const f = strength / Math.max(distSq, 300);
          p.ax += (f * dx) / dist;
          p.ay += (f * dy) / dist;
        }

        // Size: lerp from base to score-proportional (capped)
        const targetSize = lerp(MIN_RELEVANT_SIZE, MAX_RELEVANT_SIZE, score);
        p.size = lerp(BASE_SIZE, targetSize, attPhase);

        // Opacity: bright
        p.opacity = lerp(0.5, 0.7 + score * 0.3, attPhase);

        // Color: transition to cyan
        p.color = attPhase > 0.3 ? '#22d3ee' : '#ffffff';
      } else {
        // Noise particle — fade and shrink
        p.opacity = lerp(0.4, 0.08, attPhase);
        p.size = lerp(BASE_SIZE, NOISE_SIZE, attPhase);
        p.color = '#ffffff';
      }
    });

    // Noise amplitude decreases as attention focuses
    this.noise.amplitude = lerp(20, 5, attPhase);

    this.engine.step(dt, _time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) return;

    const { pool, progress } = this;
    const attPhase = smoothstep(0.2, 0.6, progress);

    // ── Connections between relevant particles ──
    if (attPhase > 0.1) {
      const relevant: Array<{ p: Particle; score: number }> = [];
      pool.forEachActive((p: Particle) => {
        if (p.group === 1) {
          const idx = Math.round(p.mass);
          relevant.push({ p, score: this.tokens[idx]?.score ?? 0.5 });
        }
      });

      // Draw connections (fully connected but line width based on scores)
      for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
          const combinedScore = relevant[i].score * relevant[j].score;
          const lineWidth = 0.5 + combinedScore * 2;
          renderLine(
            ctx,
            relevant[i].p.x,
            relevant[i].p.y,
            relevant[j].p.x,
            relevant[j].p.y,
            attPhase * 0.3,
            Math.min(lineWidth, 2.5),
            'rgba(34,211,238,1)',
          );
        }
      }
    }

    // ── Dim particles (noise) ──
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

    // ── Bright particles (relevant, with glow) ──
    pool.forEachActive((p: Particle) => {
      if (p.group === 1) {
        renderGlowDot(ctx, p.x, p.y, p.size, p.opacity, '#22d3ee', 10);
      }
    });

    // ── Inline labels for relevant particles (when focused) ──
    if (attPhase > 0.4) {
      const labelOpacity = smoothstep(0.4, 0.7, progress) * 0.8;
      pool.forEachActive((p: Particle) => {
        if (p.group === 1 && p.metadata?.label) {
          renderLabel(ctx, {
            text: String(p.metadata.label),
            x: p.x,
            y: p.y + p.size + 10,
            opacity: labelOpacity,
            size: 9,
            color: '#94a3b8', // slate-400
            align: 'center',
          });
        }
      });
    }

    // ── Title ──
    renderTitle(ctx, this.title, width, 0.5);

    // ── Count label (early phase) ──
    if (progress < 0.25) {
      const op =
        smoothstep(0, 0.05, progress) * (1 - smoothstep(0.15, 0.25, progress));
      renderLabel(ctx, {
        text: `${this.totalCount} FILES ANALYZED`,
        x: width / 2,
        y: height - 30,
        opacity: op * 0.5,
        size: 11,
        align: 'center',
      });
    }

    // ── Counter (late phase): "K affected · N ignored" ──
    const counterOpacity = smoothstep(0.5, 0.7, progress);
    if (counterOpacity > 0.01) {
      renderLabel(ctx, {
        text: `${this.relevantCount} AFFECTED \u00B7 ${this.ignoredCount} UNAFFECTED`,
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
    this.tokens = [];
    this.initialized = false;
  }

  setData(data: unknown): void {
    const d = data as AttentionData;
    if (d) {
      this.parseData(d);
      if (this.initialized) {
        this.spawnParticles();
      }
    }
  }

  /** Expose pool for hit-testing (interactive mode) */
  getPool(): ParticlePool | null {
    return this.pool ?? null;
  }
}
