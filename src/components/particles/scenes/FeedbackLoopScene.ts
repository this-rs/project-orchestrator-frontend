/**
 * FeedbackLoopScene — slide 13/15
 * "chaque itération affine le résultat"
 *
 * Elements:
 *   - Large reference circle (workspace)
 *   - 4 cardinal points labelled v1, v2, v3, v4
 *   - ~20 particles orbiting in a convergent spiral
 *   - At each iteration (quarter turn), particles move closer to center
 *   - Central counter: "×N" (current iteration)
 */

import { ParticlePool } from '../engine/ParticlePool';
import type { Particle } from '../engine/types';
import { TAU } from '../engine/types';
import {
  renderGlowDot,
  renderRing,
} from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { smoothstep, clamp } from './types';

// ── Data ──────────────────────────────────────────────────────

export interface FeedbackLoopData {
  iterations: Array<{
    label: string;
    state: string;
    timestamp: string;
  }>;
  currentIteration: number;
}

const DEFAULT_DATA: FeedbackLoopData = {
  iterations: [
    { label: 'v1', state: 'complete', timestamp: '' },
    { label: 'v2', state: 'complete', timestamp: '' },
    { label: 'v3', state: 'active', timestamp: '' },
    { label: 'v4', state: 'pending', timestamp: '' },
  ],
  currentIteration: 4,
};

// ── Constants ─────────────────────────────────────────────────

const POOL_CAPACITY = 64;
const PARTICLE_COUNT = 20;
const DECAY_LAMBDA = 0.18; // convergence speed
const ANGULAR_VELOCITY = 2.0; // rad/s equivalent in progress space
const MARKER_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]; // v1-v4
const MARKER_LABELS = ['v1', 'v2', 'v3', 'v4'];

// ── Spiral particle state (no engine needed — purely mathematical) ──

interface SpiralParticle {
  phaseOffset: number; // initial angular offset
  radiusNoise: number; // per-particle radius noise amplitude
  baseSize: number;
  baseOpacity: number;
}

// ── Scene ─────────────────────────────────────────────────────

export class FeedbackLoopScene implements ParticleScene {
  readonly name = 'feedbackLoop';
  readonly title = 'FEEDBACK LOOP';
  readonly description = 'chaque itération affine le résultat';

  // Pool used only for ambient trail particles
  private pool: ParticlePool | null = null;

  private data: FeedbackLoopData = DEFAULT_DATA;
  private cx = 0;
  private cy = 0;
  private rMax = 100;
  private progress = 0;
  private time = 0;

  // Spiral particles (mathematically driven, not physics)
  private spiralParticles: SpiralParticle[] = [];

  setData(data: unknown): void {
    const d = data as FeedbackLoopData;
    if (d && Array.isArray(d.iterations)) {
      this.data = d;
    }
  }

  init(width: number, height: number): void {
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.rMax = Math.min(width, height) * 0.32;

    this.pool = new ParticlePool(POOL_CAPACITY);

    // Create spiral particles with per-particle variation
    this.spiralParticles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.spiralParticles.push({
        phaseOffset: (TAU * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.3,
        radiusNoise: (Math.random() - 0.5) * 0.15,
        baseSize: 1.5 + Math.random() * 1.0,
        baseOpacity: 0.5 + Math.random() * 0.4,
      });
    }
  }

  resize(width: number, height: number): void {
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.rMax = Math.min(width, height) * 0.32;
    if (this.pool) this.pool.reset();
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;

    // Spawn trail dots from spiral particles
    if (!this.pool) return;

    // Recycle old trail particles
    this.pool.forEachActive((p: Particle) => {
      p.opacity -= dt * 1.5;
      if (p.opacity <= 0.01) {
        p.life = 0; // mark for recycle
      }
    });

    // Spawn new trail dots (limited rate)
    const maxIter = this.data.currentIteration;
    const t = progress * maxIter; // full N-iteration cycle
    for (const sp of this.spiralParticles) {
      if (Math.random() > 0.15) continue; // ~15% chance per frame per particle

      const theta = ANGULAR_VELOCITY * t * (TAU / 4) + sp.phaseOffset;
      const rDecay = this.rMax * Math.exp(-DECAY_LAMBDA * t);
      const rNoise = sp.radiusNoise * rDecay * (1 - progress);
      const r = rDecay + rNoise;

      const px = this.cx + r * Math.cos(theta);
      const py = this.cy + r * Math.sin(theta);

      this.pool.spawn({
        x: px,
        y: py,
        vx: 0,
        vy: 0,
        size: sp.baseSize * 0.5,
        opacity: sp.baseOpacity * 0.25,
        color: '#ffffff',
        maxLife: 9999,
        group: 0,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = this.cx;
    const cy = this.cy;
    const rMax = this.rMax;
    const progress = this.progress;
    const time = this.time;

    // ── Title ───────────────────────────────────────────
    renderTitle(ctx, this.title, width, 0.5);

    // ── Reference circle (workspace boundary) ──────────
    renderRing(ctx, cx, cy, rMax, 0.15, 'rgba(255,255,255,1)');

    // ── Version markers on outer ring ──────────────────
    const markerCount = Math.min(
      this.data.iterations.length,
      MARKER_ANGLES.length,
    );
    for (let m = 0; m < markerCount; m++) {
      const markerTheta = MARKER_ANGLES[m];
      const markerProgress = smoothstep(
        markerTheta / TAU,
        markerTheta / TAU + 0.05,
        progress,
      );
      // Always show markers at min opacity, reveal fully with progress
      const markerOpacity = Math.max(0.15, markerProgress * 0.8);

      const mx = cx + Math.cos(markerTheta) * rMax;
      const my = cy + Math.sin(markerTheta) * rMax;

      // Marker dot
      renderGlowDot(ctx, mx, my, 3, markerOpacity, '#22d3ee', 8);

      // Marker label (offset outward)
      const labelR = rMax + 18;
      const lx = cx + Math.cos(markerTheta) * labelR;
      const ly = cy + Math.sin(markerTheta) * labelR;

      const label =
        this.data.iterations[m]?.label ??
        MARKER_LABELS[m] ??
        `v${m + 1}`;
      renderLabel(ctx, {
        text: label,
        x: lx,
        y: ly,
        opacity: markerOpacity * 0.8,
        size: 11,
        color: '#22d3ee',
        align: 'center',
      });
    }

    // ── Trail particles (faint ghosts) ─────────────────
    if (this.pool) {
      this.pool.forEachActive((p: Particle) => {
        if (p.opacity <= 0.01) return;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // ── Spiral particles (main) ────────────────────────
    const maxIter = this.data.currentIteration;
    const t = progress * maxIter;

    for (const sp of this.spiralParticles) {
      const theta = ANGULAR_VELOCITY * t * (TAU / 4) + sp.phaseOffset;
      const rDecay = rMax * Math.exp(-DECAY_LAMBDA * t);
      const rNoise = sp.radiusNoise * rDecay * (1 - progress);
      const r = Math.max(5, rDecay + rNoise);

      const px = cx + r * Math.cos(theta);
      const py = cy + r * Math.sin(theta);

      // Size grows slightly as particles converge
      const convergeFactor = 1.0 - r / rMax;
      const size = sp.baseSize * (1 + convergeFactor * 0.8);
      const opacity = sp.baseOpacity * (0.6 + convergeFactor * 0.4);

      // Glow dot for each spiral particle
      renderGlowDot(ctx, px, py, size, opacity, '#ffffff', size * 3);
    }

    // ── Spiral path hint (faint arc) ──────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const pathSteps = 200;
    for (let s = 0; s <= pathSteps; s++) {
      const pt = (s / pathSteps) * t;
      const theta = ANGULAR_VELOCITY * pt * (TAU / 4);
      const r = rMax * Math.exp(-DECAY_LAMBDA * pt);
      const px = cx + r * Math.cos(theta);
      const py = cy + r * Math.sin(theta);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // ── Center glow (convergence target) ──────────────
    const centerGlow = 0.3 + 0.15 * Math.sin(time * 2);
    const centerSize = 4 + progress * 3;
    renderGlowDot(
      ctx,
      cx,
      cy,
      centerSize,
      centerGlow + progress * 0.3,
      '#ffffff',
      20,
    );

    // ── Central iteration counter ─────────────────────
    const iteration = clamp(
      Math.floor(progress * maxIter) + 1,
      1,
      maxIter,
    );
    ctx.save();
    ctx.font = '24px "JetBrains Mono", monospace';
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillText(`\u00d7${iteration}`, cx, cy + 22);
    ctx.restore();

    // ── Bottom label ──────────────────────────────────
    renderLabel(ctx, {
      text: `itération ${iteration} / ${maxIter}`,
      x: width / 2,
      y: height - 30,
      opacity: 0.5,
      size: 10,
      color: '#ffffff',
      align: 'center',
    });
  }

  dispose(): void {
    if (this.pool) this.pool.reset();
    this.pool = null;
    this.spiralParticles = [];
  }
}
