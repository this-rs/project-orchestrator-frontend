/**
 * SignalNoiseScene — "un signal clair émerge quand le bruit s'efface"
 *
 * Phase 1 (0-30%): ~100 noise particles + 1 signal, all same appearance
 * Phase 2 (30-70%): Noise fades, signal grows with halo
 * Phase 3 (70-100%): Noise nearly invisible, signal pulsing with concentric rings
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
import { renderGlowDot, renderRing } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

const NOISE_COUNT = 100;
const MAX_CAPACITY = 120;
const SIGNAL_GROUP = 1;
const NOISE_GROUP = 0;

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export class SignalNoiseScene implements ParticleScene {
  readonly name = 'signal-noise';
  readonly title = 'SIGNAL / NOISE';
  readonly description = "un signal clair émerge quand le bruit s'efface";

  private pool!: ParticlePool;
  private engine!: ParticleEngine;
  private noiseForce!: NoiseForce;
  private boundary!: BoundaryForce;
  private w = 0;
  private h = 0;
  private progress = 0;
  private time = 0;
  private signalX = 0;
  private signalY = 0;
  private initialized = false;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.signalX = width / 2;
    this.signalY = height / 2;

    this.pool = new ParticlePool(MAX_CAPACITY);
    this.engine = new ParticleEngine(this.pool, 0.96);

    this.noiseForce = new NoiseForce({
      frequency: 0.012,
      amplitude: 45,
      speed: 0.8,
    });
    const drag = new DragForce({ coefficient: 3 });
    this.boundary = new BoundaryForce({
      left: 10,
      right: width - 10,
      top: 55,
      bottom: height - 50,
      bounce: 0.4,
    });

    this.engine.addForce(this.noiseForce);
    this.engine.addForce(drag);
    this.engine.addForce(this.boundary);

    this.spawnParticles();
    this.initialized = true;
  }

  private spawnParticles(): void {
    this.pool.reset();
    const { w, h, signalX, signalY } = this;

    // Noise particles: scattered everywhere
    for (let i = 0; i < NOISE_COUNT; i++) {
      this.pool.spawn({
        x: 15 + Math.random() * (w - 30),
        y: 60 + Math.random() * (h - 120),
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        size: 2,
        opacity: 0.5,
        color: '#ffffff',
        maxLife: 99999,
        group: NOISE_GROUP,
      });
    }

    // Signal particle: starts at center, same appearance as noise
    this.pool.spawn({
      x: signalX,
      y: signalY,
      vx: 0,
      vy: 0,
      size: 2,
      opacity: 0.5,
      color: '#ffffff',
      maxLife: 99999,
      group: SIGNAL_GROUP,
    });
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.signalX = width / 2;
    this.signalY = height / 2;
    this.boundary.right = width - 10;
    this.boundary.bottom = height - 50;
    this.spawnParticles();
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;
    if (!this.initialized) return;

    // noise_decay = smoothstep(0.2, 0.7, progress)
    const noiseDecay = smoothstep(0.2, 0.7, progress);
    const cx = this.signalX;
    const cy = this.signalY;

    this.pool.forEachActive((p: Particle) => {
      if (p.group === SIGNAL_GROUP) {
        // Signal: stays anchored at center, grows
        const dx = cx - p.x;
        const dy = cy - p.y;
        p.ax += dx * 5; // strong spring to center
        p.ay += dy * 5;

        // signal.opacity = lerp(0.5, 1.0, noise_decay)
        p.opacity = lerp(0.5, 1.0, noiseDecay);
        // signal.size = lerp(4, 12, easeOutQuad(noise_decay))
        p.size = lerp(4, 12, easeOutQuad(noiseDecay));
        p.color = noiseDecay > 0.2 ? '#22d3ee' : '#ffffff';
      } else {
        // noise_i.opacity = max(0, (1 - noise_decay) * 0.6)
        p.opacity = Math.max(0, (1 - noiseDecay) * 0.6);
        // noise_i.size = lerp(2, 0.5, noise_decay)
        p.size = lerp(2, 0.5, noiseDecay);
      }
    });

    this.engine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) return;
    const { progress, time, signalX, signalY, pool } = this;
    const noiseDecay = smoothstep(0.2, 0.7, progress);

    // ── Noise particles ──
    ctx.save();
    pool.forEachActive((p: Particle) => {
      if (p.group === NOISE_GROUP && p.opacity > 0.01) {
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    });
    ctx.restore();

    // ── Concentric rings around signal ──
    // for ring in 1..3: ring_r = signal.size + ring * 8
    //   ring_opacity = (1 - ring/3) * noise_decay * 0.2
    if (noiseDecay > 0.1) {
      const signalSize = lerp(4, 12, easeOutQuad(noiseDecay));
      for (let ring = 1; ring <= 3; ring++) {
        const ringR = signalSize + ring * 8;
        const ringOp = (1 - ring / 3) * noiseDecay * 0.2;
        renderRing(ctx, signalX, signalY, ringR, ringOp, '#ffffff');
      }
    }

    // ── Pulsing halo (gradient) ──
    // halo_radius = signal.size * 3 + sin(time * 3) * 4
    // halo_opacity = 0.15 + 0.05 * sin(time * 3)
    if (noiseDecay > 0.3) {
      const signalSize = lerp(4, 12, easeOutQuad(noiseDecay));
      const pulse = Math.sin(time * 3);
      const haloR = signalSize * 3 + pulse * 4;
      const haloOp = 0.15 + 0.05 * pulse;

      ctx.save();
      const gradient = ctx.createRadialGradient(
        signalX,
        signalY,
        signalSize,
        signalX,
        signalY,
        haloR,
      );
      gradient.addColorStop(0, `rgba(34,211,238,${haloOp})`);
      gradient.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(signalX, signalY, haloR, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ── Signal dot ──
    let signalP: Particle | null = null;
    pool.forEachActive((p: Particle) => {
      if (p.group === SIGNAL_GROUP) signalP = p;
    });
    if (signalP) {
      const sp = signalP as Particle;
      renderGlowDot(ctx, sp.x, sp.y, sp.size, sp.opacity, '#22d3ee', 16);
    }

    // ── Title ──
    renderTitle(ctx, this.title, width, 0.5);

    // ── Phase labels ──
    if (progress < 0.25) {
      const op =
        smoothstep(0, 0.05, progress) * (1 - smoothstep(0.15, 0.25, progress));
      renderLabel(ctx, {
        text: 'BRUIT',
        x: width / 2,
        y: height - 30,
        opacity: op * 0.5,
        size: 11,
        align: 'center',
      });
    }
    if (progress > 0.7) {
      const op = smoothstep(0.7, 0.85, progress);
      renderLabel(ctx, {
        text: 'SIGNAL',
        x: width / 2,
        y: height - 30,
        opacity: op * 0.7,
        size: 11,
        color: '#22d3ee',
        align: 'center',
      });
    }
  }

  dispose(): void {
    if (this.pool) this.pool.reset();
    this.initialized = false;
  }

  setData(_data: unknown): void {
    // Could accept custom noise/signal counts
  }
}
