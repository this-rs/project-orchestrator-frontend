/**
 * CanvasRenderer — Renders particles as glowing dots on Canvas 2D.
 *
 * Cosmos/terminal style: white/gray dots with soft glow on black background.
 * Zero-alloc in the hot path.
 */

import type { Particle } from '../engine/types';
import type { ParticlePool } from '../engine/ParticlePool';

export interface RenderOptions {
  /** Enable glow effect (shadowBlur). Costs ~2x but looks great. Default true */
  glow?: boolean;
  /** Global opacity multiplier. Default 1 */
  globalAlpha?: number;
}

const DEFAULT_OPTS: Required<RenderOptions> = {
  glow: true,
  globalAlpha: 1,
};

/**
 * Render all active particles from a pool onto the given context.
 * Zero-alloc: no arrays created, no closures captured.
 */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  pool: ParticlePool,
  opts: RenderOptions = DEFAULT_OPTS,
): void {
  const glow = opts.glow ?? true;
  const globalAlpha = opts.globalAlpha ?? 1;

  if (glow) {
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 6;
  }

  pool.forEachActive((p: Particle) => {
    const alpha = p.opacity * globalAlpha;
    if (alpha <= 0.01) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Reset shadow
  if (glow) {
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw a trail (array of positions with decreasing opacity).
 */
export function renderTrail(
  ctx: CanvasRenderingContext2D,
  trail: { x: number; y: number }[],
  baseOpacity: number,
  size: number,
  color: string,
): void {
  const len = trail.length;
  if (len === 0) return;

  ctx.fillStyle = color;
  for (let j = 0; j < len; j++) {
    const alpha = (1 - j / len) * baseOpacity;
    if (alpha <= 0.01) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(trail[j].x, trail[j].y, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw a connection line between two points.
 */
export function renderLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opacity: number,
  width: number,
  color: string = '#ffffff',
): void {
  if (opacity <= 0.01) return;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Draw a pulsing ring (target circle).
 */
export function renderRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  opacity: number,
  color: string = '#22d3ee',
): void {
  if (opacity <= 0.01) return;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Draw a glowing dot (bigger particle with halo).
 */
export function renderGlowDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opacity: number,
  color: string = '#ffffff',
  glowSize: number = 12,
): void {
  if (opacity <= 0.01) return;

  // Glow halo
  ctx.globalAlpha = opacity * 0.3;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowSize;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Core dot
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
