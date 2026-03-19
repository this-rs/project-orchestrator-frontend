/**
 * FocusScene — slide 3/15
 * "FOCUS — même énergie, résultat radicalement différent"
 *
 * Split left/right:
 *   Left  — ~40 particles in brownian noise (dispersed)
 *   Right — ~40 particles converging toward a target circle (focused)
 *           with luminous trails behind each particle
 *
 * Progress-driven: at 30% the right side begins converging.
 */

import { ParticlePool } from '../engine/ParticlePool';
import { ParticleEngine } from '../engine/ParticleEngine';
import { NoiseForce, BoundaryForce } from '../engine/forces';
import type { Particle } from '../engine/types';
import { TAU } from '../engine/types';
import { renderGlowDot, renderRing, renderTrail } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { clamp, easeInOutCubic, easeInOut, lerp } from './types';

// ── Constants ────────────────────────────────────────────────
const PARTICLE_COUNT = 40;
const POOL_SIZE = PARTICLE_COUNT + 16;
const TRAIL_LENGTH = 5;

// ── Trail entry (pre-allocated) ──────────────────────────────
interface TrailPt {
  x: number;
  y: number;
}

// ── Scene ────────────────────────────────────────────────────

export class FocusScene implements ParticleScene {
  readonly name = 'focus';
  readonly title = 'FOCUS';
  readonly description =
    'Same energy, radically different result — dispersed vs focused';

  private leftPool!: ParticlePool;
  private leftEngine!: ParticleEngine;

  private w = 0;
  private h = 0;
  private midX = 0;
  private time = 0;
  private progress = 0;

  // Right-side: manual position management (no engine, lerp-driven)
  private rightParticles: {
    scatterX: number;
    scatterY: number;
    x: number;
    y: number;
    size: number;
    opacity: number;
    trail: TrailPt[];
  }[] = [];

  // Ray geometry
  private rayOriginX = 0;
  private rayOriginY = 0;
  private rayEndX = 0;
  private rayEndY = 0;

  private trailFrame = 0;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.midX = width / 2;
    this.trailFrame = 0;
    this.computeRay();

    // ── Left panel: noise-driven brownian particles ──
    this.leftPool = new ParticlePool(POOL_SIZE);
    this.leftEngine = new ParticleEngine(this.leftPool, 0.96);
    this.leftEngine.addForce(
      new NoiseForce({ frequency: 0.008, amplitude: 60, speed: 0.6 }),
    );
    this.leftEngine.addForce(
      new BoundaryForce({
        left: 20,
        right: this.midX - 20,
        top: 60,
        bottom: height - 50,
        bounce: 0.4,
      }),
    );

    const leftCx = width * 0.25;
    const leftCy = height * 0.5;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * TAU;
      const r = 20 + Math.random() * 80;
      this.leftPool.spawn({
        x: leftCx + Math.cos(angle) * r,
        y: leftCy + Math.sin(angle) * r,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        size: 1.5 + Math.random() * 1.5,
        opacity: 0.4 + Math.random() * 0.3,
        color: '#ffffff',
        maxLife: 9999,
        mass: 1,
        group: 0,
      });
    }

    // ── Right panel: lerp-driven convergence ──
    this.rightParticles = [];
    const rightCx = width * 0.75;
    const rightCy = height * 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * TAU;
      const r = 20 + Math.random() * 80;
      const sx = rightCx + Math.cos(angle) * r;
      const sy = rightCy + Math.sin(angle) * r;

      const trail: TrailPt[] = [];
      for (let j = 0; j < TRAIL_LENGTH; j++) trail.push({ x: sx, y: sy });

      this.rightParticles.push({
        scatterX: sx,
        scatterY: sy,
        x: sx,
        y: sy,
        size: 1.5 + Math.random() * 1.5,
        opacity: 0.4 + Math.random() * 0.3,
        trail,
      });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.midX = width / 2;
    this.computeRay();
  }

  update(dt: number, progress: number, time: number): void {
    this.time = time;
    this.progress = progress;

    // Left: pure noise physics
    this.leftEngine.step(dt, time);

    // Right: lerp scatter → beam
    const phase = clamp((progress - 0.3) / 0.4, 0, 1);
    const eased = easeInOutCubic(phase);
    const rightCx = this.w * 0.75;
    const rightCy = this.h * 0.5;

    this.trailFrame++;
    const doTrail = this.trailFrame % 3 === 0;

    for (let i = 0; i < this.rightParticles.length; i++) {
      const rp = this.rightParticles[i];

      // Scatter wander
      if (phase < 1) {
        rp.scatterX += (Math.random() - 0.5) * 30 * dt;
        rp.scatterY += (Math.random() - 0.5) * 30 * dt;
        // Soft containment
        const dx = rp.scatterX - rightCx;
        const dy = rp.scatterY - rightCy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 100) {
          rp.scatterX -= dx * 0.03;
          rp.scatterY -= dy * 0.03;
        }
      }

      // Target along ray
      const t = i / PARTICLE_COUNT;
      const tx = lerp(this.rayOriginX, this.rayEndX, t);
      const ty = lerp(this.rayOriginY, this.rayEndY, t);

      rp.x = lerp(rp.scatterX, tx, eased);
      rp.y = lerp(rp.scatterY, ty, eased);

      // Trail shift
      if (doTrail) {
        for (let j = TRAIL_LENGTH - 1; j > 0; j--) {
          rp.trail[j].x = rp.trail[j - 1].x;
          rp.trail[j].y = rp.trail[j - 1].y;
        }
        rp.trail[0].x = rp.x;
        rp.trail[0].y = rp.y;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { midX, time, progress } = this;
    const phase = clamp((progress - 0.3) / 0.4, 0, 1);
    const eased = easeInOutCubic(phase);

    // ── Divider ──
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Left: dispersed particles ──
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 3;

    this.leftPool.forEachActive((p: Particle) => {
      const a = p.opacity * p.life;
      if (a <= 0.01) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ── Right: target ring ──
    const ringOpacity = easeInOut(phase) * 0.5;
    if (ringOpacity > 0.01) {
      renderRing(
        ctx,
        this.rayEndX,
        this.rayEndY,
        12 + 4 * Math.sin(time * 2),
        ringOpacity,
        '#22d3ee',
      );
      renderGlowDot(
        ctx,
        this.rayEndX,
        this.rayEndY,
        4,
        ringOpacity * 0.8,
        '#22d3ee',
        16,
      );
    }

    // ── Right: trails ──
    for (let i = 0; i < this.rightParticles.length; i++) {
      const rp = this.rightParticles[i];
      const trailOpacity = eased * 0.3;
      if (trailOpacity > 0.01) {
        renderTrail(ctx, rp.trail, trailOpacity, rp.size, '#ffffff');
      }
    }

    // ── Right: particles ──
    ctx.shadowColor =
      phase > 0.5
        ? 'rgba(34,211,238,0.4)'
        : 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 3;

    for (let i = 0; i < this.rightParticles.length; i++) {
      const rp = this.rightParticles[i];
      ctx.globalAlpha = rp.opacity;
      ctx.fillStyle = phase > 0.5 ? '#22d3ee' : '#ffffff';
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.size, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ── Labels ──
    renderLabel(ctx, {
      text: 'DISPERSÉ',
      x: width * 0.25,
      y: height - 28,
      opacity: 0.4,
      size: 10,
    });
    renderLabel(ctx, {
      text: 'FOCALISÉ',
      x: width * 0.75,
      y: height - 28,
      opacity: 0.4,
      size: 10,
      color: '#22d3ee',
    });

    renderTitle(ctx, 'FOCUS', width, 0.5);
  }

  dispose(): void {
    this.leftEngine.reset();
    this.rightParticles = [];
  }

  setData(_data: unknown): void {
    // No external data needed
  }

  private computeRay(): void {
    // Ray from scattered area toward a target point (right panel)
    this.rayOriginX = this.midX + (this.w - this.midX) * 0.15;
    this.rayOriginY = this.h * 0.3;
    this.rayEndX = this.w * 0.85;
    this.rayEndY = this.h * 0.7;
  }
}
