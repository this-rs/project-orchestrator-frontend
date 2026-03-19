/**
 * SystemScene — Slide 4/15: "SYSTÈME — construis une fois, tourne pour toujours"
 *
 * Split-screen comparison:
 *   Left: "MANUEL" — rectangle with 4 corner dots and a single walker dot
 *         tracing edges sequentially (monotone, sequential).
 *   Right: "SYSTÈME" — glowing center with 8 particles in circular orbit,
 *          periodic tangential ejection (dynamic, self-sustaining).
 */

import type { ParticleScene } from './types';
import { TAU } from '../engine';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

// ── Constants ──────────────────────────────────────────────

const RECT_COLOR = 'rgba(255, 255, 255, 0.2)';
const CORNER_COLOR = 'rgba(255, 255, 255, 0.4)';
const ORBIT_COLOR = 'rgba(255, 255, 255, 0.15)';
const PARTICLE_COLOR = 'rgba(255, 255, 255, 0.8)';
const CENTER_GLOW = '#22d3ee';
const EJECT_COLOR = '#22d3ee';

const ORBIT_N = 8;
const WALKER_SPEED = 0.3; // full perimeter / second
const ORBIT_SPEED = 0.8; // rad/s
const EJECT_INTERVAL = 2.5; // seconds
const EJECT_SPEED_FACTOR = 80; // px/s at scale=1
const EJECT_LIFE = 1.5; // seconds

// ── Ejected particle struct ────────────────────────────────

interface Ejected {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  active: boolean;
}

// ── Helper ─────────────────────────────────────────────────

function rectPerimeterPos(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  dist: number,
): [number, number] {
  let d = dist;
  if (d < rw) return [rx + d, ry];
  d -= rw;
  if (d < rh) return [rx + rw, ry + d];
  d -= rh;
  if (d < rw) return [rx + rw - d, ry + rh];
  d -= rw;
  return [rx, ry + rh - d];
}

// ── Scene ──────────────────────────────────────────────────

export class SystemScene implements ParticleScene {
  readonly name = 'system';
  readonly title = 'SYST\u00C8ME';
  readonly description = 'Manual sequential vs self-sustaining system.';

  private w = 0;
  private h = 0;
  private time = 0;

  // Layout
  private leftCx = 0;
  private rightCx = 0;
  private centerY = 0;
  private rectW = 0;
  private rectH = 0;
  private orbitRadius = 0;
  private scale = 1;

  // Ejected particles (small fixed pool)
  private ejected: Ejected[] = [];
  private lastEjectTime = -EJECT_INTERVAL;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();

    this.ejected = [];
    this.lastEjectTime = -EJECT_INTERVAL;
    for (let i = 0; i < 8; i++) {
      this.ejected.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, active: false });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  private computeLayout(): void {
    this.scale = Math.min(this.w, this.h) / 400;
    this.leftCx = this.w * 0.28;
    this.rightCx = this.w * 0.72;
    this.centerY = this.h * 0.55;
    this.rectW = 100 * this.scale;
    this.rectH = 80 * this.scale;
    this.orbitRadius = 55 * this.scale;
  }

  update(dt: number, _progress: number, time: number): void {
    this.time = time;

    const { rightCx, centerY, orbitRadius, scale, ejected } = this;

    // ── Eject particle tangentially from orbit ────────
    if (time - this.lastEjectTime >= EJECT_INTERVAL) {
      this.lastEjectTime = time;
      const srcIdx = Math.floor(Math.random() * ORBIT_N);
      const theta = (TAU * srcIdx) / ORBIT_N + ORBIT_SPEED * time;
      const ox = rightCx + orbitRadius * Math.cos(theta);
      const oy = centerY + orbitRadius * Math.sin(theta);
      const tx = -Math.sin(theta);
      const ty = Math.cos(theta);
      const spd = EJECT_SPEED_FACTOR * scale;

      for (const e of ejected) {
        if (!e.active) {
          e.x = ox;
          e.y = oy;
          e.vx = tx * spd;
          e.vy = ty * spd;
          e.age = 0;
          e.active = true;
          break;
        }
      }
    }

    // ── Update ejected ────────────────────────────────
    for (const e of ejected) {
      if (!e.active) continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.age += dt;
      if (e.age >= EJECT_LIFE) e.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const {
      leftCx, rightCx, centerY, rectW, rectH, orbitRadius,
      time, scale, ejected,
    } = this;

    // ── Title ─────────────────────────────────────────
    renderTitle(ctx, 'SYST\u00C8ME', width, 0.5);

    // Subtitle
    renderLabel(ctx, {
      text: 'construis une fois, tourne pour toujours',
      x: width / 2,
      y: height - 24,
      opacity: 0.35,
      size: 10,
    });

    // ═════════════════════════════════════════════════════
    // LEFT: Manual — rectangle with walking dot
    // ═════════════════════════════════════════════════════

    const rx = leftCx - rectW / 2;
    const ry = centerY - rectH / 2;

    // Rectangle
    ctx.strokeStyle = RECT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rectW, rectH);

    // Corner dots
    const corners: [number, number][] = [
      [rx, ry],
      [rx + rectW, ry],
      [rx + rectW, ry + rectH],
      [rx, ry + rectH],
    ];
    ctx.fillStyle = CORNER_COLOR;
    for (const [cx2, cy2] of corners) {
      ctx.beginPath();
      ctx.arc(cx2, cy2, 3 * scale, 0, TAU);
      ctx.fill();
    }

    // Walking dot (traces perimeter)
    const perimeter = 2 * (rectW + rectH);
    const walkerT = ((time * WALKER_SPEED) % 1 + 1) % 1;
    const [wpx, wpy] = rectPerimeterPos(rx, ry, rectW, rectH, walkerT * perimeter);

    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(wpx, wpy, 4 * scale, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Label
    renderLabel(ctx, {
      text: 'MANUEL',
      x: leftCx,
      y: centerY + rectH / 2 + 24 * scale,
      opacity: 0.35,
      size: 10,
    });

    // ═════════════════════════════════════════════════════
    // RIGHT: System — orbital particles + ejection
    // ═════════════════════════════════════════════════════

    // Orbit ring (thin)
    ctx.strokeStyle = ORBIT_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rightCx, centerY, orbitRadius, 0, TAU);
    ctx.stroke();

    // Center glow (radial gradient)
    const glowR = 14 * scale;
    const grad = ctx.createRadialGradient(rightCx, centerY, 0, rightCx, centerY, glowR);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.6)');
    grad.addColorStop(0.5, 'rgba(34, 211, 238, 0.15)');
    grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rightCx, centerY, glowR, 0, TAU);
    ctx.fill();

    // Center dot
    ctx.fillStyle = CENTER_GLOW;
    ctx.beginPath();
    ctx.arc(rightCx, centerY, 3 * scale, 0, TAU);
    ctx.fill();

    // Orbiting particles
    ctx.fillStyle = PARTICLE_COLOR;
    for (let i = 0; i < ORBIT_N; i++) {
      const theta = (TAU * i) / ORBIT_N + ORBIT_SPEED * time;
      const px = rightCx + orbitRadius * Math.cos(theta);
      const py = centerY + orbitRadius * Math.sin(theta);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(px, py, 3 * scale, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Ejected particles (cyan, fading + shrinking)
    for (const e of ejected) {
      if (!e.active) continue;
      const alpha = 1 - e.age / EJECT_LIFE;
      const sz = 3 * scale * alpha;
      if (alpha <= 0.01 || sz < 0.5) continue;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = EJECT_COLOR;
      ctx.shadowBlur = 8;
      ctx.fillStyle = EJECT_COLOR;
      ctx.beginPath();
      ctx.arc(e.x, e.y, sz, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Label
    renderLabel(ctx, {
      text: 'SYST\u00C8ME',
      x: rightCx,
      y: centerY + orbitRadius + 24 * scale,
      opacity: 0.35,
      size: 10,
    });
  }

  dispose(): void {
    this.ejected = [];
  }
}
