/**
 * FeedbackLoopScene — slide 13/15
 * "chaque itération affine le résultat"
 *
 * Elements:
 *   - Large reference circle (workspace)
 *   - N cardinal points labelled v1, v2, ... vN (dynamic from data)
 *   - ~20 particles orbiting in a convergent spiral
 *   - At each iteration (quarter turn), particles move closer to center
 *   - Central counter: "×N" (current iteration)
 *   - Particles color-coded by status: cyan=running, green=completed, red=failed
 *   - Markers expose metadata for interactive hit-testing (state name, duration, status)
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
    duration_ms?: number;
    status?: 'running' | 'completed' | 'failed';
    state_id?: string;
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

// ── Status → Color mapping ──────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  running: '#22d3ee',   // cyan
  completed: '#34d399', // green
  failed: '#f87171',    // red
};

const DEFAULT_PARTICLE_COLOR = '#ffffff';

// ── Constants ─────────────────────────────────────────────────

const POOL_CAPACITY = 128; // bumped to accommodate marker particles
const PARTICLE_COUNT = 20;
const DECAY_LAMBDA = 0.18; // convergence speed
const ANGULAR_VELOCITY = 2.0; // rad/s equivalent in progress space

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

  // Pool used for trail particles AND marker hit-test particles
  private pool: ParticlePool | null = null;

  private data: FeedbackLoopData = DEFAULT_DATA;
  private cx = 0;
  private cy = 0;
  private rMax = 100;
  private progress = 0;
  private time = 0;

  // Spiral particles (mathematically driven, not physics)
  private spiralParticles: SpiralParticle[] = [];

  // Marker angles computed dynamically based on iteration count
  private markerAngles: number[] = [];

  setData(data: unknown): void {
    const d = data as FeedbackLoopData;
    if (d && Array.isArray(d.iterations)) {
      this.data = d;
      this.computeMarkerAngles();
    }
  }

  private computeMarkerAngles(): void {
    const count = this.data.iterations.length;
    this.markerAngles = [];
    for (let i = 0; i < count; i++) {
      this.markerAngles.push((TAU * i) / Math.max(count, 1));
    }
  }

  /** Expose pool for interactive hit-testing in ParticleViz */
  getPool(): ParticlePool | null {
    return this.pool;
  }

  init(width: number, height: number): void {
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.rMax = Math.min(width, height) * 0.32;

    this.pool = new ParticlePool(POOL_CAPACITY);
    this.computeMarkerAngles();

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

  /** Resolve the dominant color for spiral particles based on the overall run status */
  private getSpiralColor(): string {
    const iters = this.data.iterations;
    if (iters.length === 0) return DEFAULT_PARTICLE_COLOR;

    // Use the last iteration's status as the dominant color
    const lastStatus = iters[iters.length - 1]?.status;
    return STATUS_COLORS[lastStatus ?? ''] ?? DEFAULT_PARTICLE_COLOR;
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;

    if (!this.pool) return;

    // Recycle old trail particles (group 0 = trails)
    this.pool.forEachActive((p: Particle) => {
      if (p.group === 0) {
        p.opacity -= dt * 1.5;
        if (p.opacity <= 0.01) {
          p.life = 0; // mark for recycle
        }
      }
    });

    // Recycle dead trail particles
    this.pool.forEachActive((p: Particle) => {
      if (p.group === 0 && p.life <= 0) {
        this.pool!.recycle(p);
      }
    });

    // Spawn trail dots from spiral particles
    const maxIter = this.data.currentIteration;
    const t = progress * maxIter;
    const spiralColor = this.getSpiralColor();

    for (const sp of this.spiralParticles) {
      if (Math.random() > 0.15) continue;

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
        color: spiralColor,
        maxLife: 9999,
        group: 0, // trail group
      });
    }

    // ── Spawn/update marker particles for hit-testing (group 1) ──
    // Recycle old marker particles first
    this.pool.forEachActive((p: Particle) => {
      if (p.group === 1) {
        this.pool!.recycle(p);
      }
    });

    // Spawn fresh marker particles at current positions
    const markerCount = this.data.iterations.length;
    for (let m = 0; m < markerCount; m++) {
      const markerTheta = this.markerAngles[m] ?? 0;
      const mx = this.cx + Math.cos(markerTheta) * this.rMax;
      const my = this.cy + Math.sin(markerTheta) * this.rMax;

      const iter = this.data.iterations[m];
      const markerStatus = iter?.status ?? 'completed';
      const durationMs = iter?.duration_ms;
      const durationStr = durationMs != null
        ? durationMs < 1000
          ? `${durationMs}ms`
          : `${(durationMs / 1000).toFixed(1)}s`
        : undefined;

      this.pool.spawn({
        x: mx,
        y: my,
        vx: 0,
        vy: 0,
        size: 6, // larger hit area for markers
        opacity: 0.9,
        color: STATUS_COLORS[markerStatus] ?? '#22d3ee',
        maxLife: 9999,
        group: 1, // marker group
        metadata: {
          label: `${iter?.label ?? `v${m + 1}`} — ${iter?.state ?? 'unknown'}`,
          name: iter?.state ?? 'unknown',
          markerIndex: m,
          state_id: iter?.state_id,
          state_name: iter?.state,
          status: markerStatus,
          duration: durationStr,
          duration_ms: durationMs,
        },
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = this.cx;
    const cy = this.cy;
    const rMax = this.rMax;
    const progress = this.progress;
    const time = this.time;
    const spiralColor = this.getSpiralColor();

    // ── Title ───────────────────────────────────────────
    renderTitle(ctx, this.title, width, 0.5);

    // ── Reference circle (workspace boundary) ──────────
    renderRing(ctx, cx, cy, rMax, 0.15, 'rgba(255,255,255,1)');

    // ── Version markers on outer ring ──────────────────
    const markerCount = this.data.iterations.length;
    for (let m = 0; m < markerCount; m++) {
      const markerTheta = this.markerAngles[m] ?? 0;
      const markerProgress = smoothstep(
        markerTheta / TAU,
        markerTheta / TAU + 0.05,
        progress,
      );
      const markerOpacity = Math.max(0.15, markerProgress * 0.8);

      const mx = cx + Math.cos(markerTheta) * rMax;
      const my = cy + Math.sin(markerTheta) * rMax;

      // Color marker dot by status
      const iter = this.data.iterations[m];
      const markerColor = STATUS_COLORS[iter?.status ?? ''] ?? '#22d3ee';

      renderGlowDot(ctx, mx, my, 3, markerOpacity, markerColor, 8);

      // Marker label (offset outward)
      const labelR = rMax + 18;
      const lx = cx + Math.cos(markerTheta) * labelR;
      const ly = cy + Math.sin(markerTheta) * labelR;

      const label =
        iter?.label ?? `v${m + 1}`;
      renderLabel(ctx, {
        text: label,
        x: lx,
        y: ly,
        opacity: markerOpacity * 0.8,
        size: 11,
        color: markerColor,
        align: 'center',
      });
    }

    // ── Trail particles (faint ghosts) ─────────────────
    if (this.pool) {
      this.pool.forEachActive((p: Particle) => {
        if (p.group !== 0 || p.opacity <= 0.01) return;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
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

      // Glow dot colored by status
      renderGlowDot(ctx, px, py, size, opacity, spiralColor, size * 3);
    }

    // ── Spiral path hint (faint arc) ──────────────────
    ctx.save();
    ctx.strokeStyle = `${spiralColor}0a`; // very faint
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
      spiralColor,
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
