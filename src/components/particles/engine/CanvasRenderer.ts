/**
 * CanvasRenderer — Canvas 2D particle rendering with radial gradient glow.
 *
 * Draws: glow halos (radial gradient), core dots, connection lines, contour circles.
 * Optimized: gradient cache by size bucket, batched composite operations,
 * translate-based glow to avoid per-particle gradient creation.
 */

import type { Particle } from './types';
import { ParticlePool } from './ParticlePool';
import { TAU } from './types';

// ── Color Utility ───────────────────────────────────────────

/**
 * Convert a hex color + alpha to an rgba() string.
 * Accepts #rgb, #rrggbb, or pass-through rgba().
 */
export function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${alpha})`);
  }

  let r = 255,
    g = 255,
    b = 255;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  }

  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Gradient Cache ──────────────────────────────────────────

const GRADIENT_BUCKET_SIZE = 0.5; // round sizes to nearest 0.5px

function gradientBucket(size: number): number {
  return Math.round(size / GRADIENT_BUCKET_SIZE) * GRADIENT_BUCKET_SIZE;
}

// ── Render Config ───────────────────────────────────────────

export interface RenderConfig {
  glow: boolean;
  glowIntensity: number; // 0..1, multiplied with particle opacity
  glowScale: number; // glow radius = size * glowScale
  fadeWithLife: boolean;
  backgroundColor: string;
}

const DEFAULT_RENDER_CONFIG: RenderConfig = {
  glow: true,
  glowIntensity: 0.3,
  glowScale: 3,
  fadeWithLife: true,
  backgroundColor: '#000000',
};

// ── CanvasRenderer ──────────────────────────────────────────

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  config: RenderConfig;
  width = 0;
  height = 0;
  dpr = 1;

  // Gradient cache: key = "bucket_color" → gradient at origin
  private _gradientCache = new Map<string, CanvasGradient>();
  private _cacheCtx: CanvasRenderingContext2D | null = null;

  constructor(
    ctx: CanvasRenderingContext2D,
    config: Partial<RenderConfig> = {},
  ) {
    this.ctx = ctx;
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };
  }

  setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
    // Invalidate cache on context change
    if (this._cacheCtx !== ctx) {
      this._gradientCache.clear();
      this._cacheCtx = ctx;
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Gradient cache remains valid across resizes (origin-based)
  }

  clear(): void {
    const { ctx, config } = this;
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, this.width * this.dpr, this.height * this.dpr);
  }

  /**
   * Full draw pass: clear → glow halos → core dots.
   */
  drawParticles(pool: ParticlePool): void {
    const { ctx, config, dpr } = this;

    // Ensure cache ctx is current
    if (this._cacheCtx !== ctx) {
      this._gradientCache.clear();
      this._cacheCtx = ctx;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Pass 1: glow halos (additive blend for soft light accumulation)
    if (config.glow) {
      ctx.globalCompositeOperation = 'lighter';
      pool.forEachActive((p: Particle) => {
        const alpha = config.fadeWithLife ? p.opacity * p.life : p.opacity;
        if (alpha <= 0.01) return;
        this._drawGlow(p.x, p.y, p.size, alpha, p.color);
      });
    }

    // Pass 2: core dots (normal blend)
    ctx.globalCompositeOperation = 'source-over';
    pool.forEachActive((p: Particle) => {
      const alpha = config.fadeWithLife ? p.opacity * p.life : p.opacity;
      if (alpha <= 0.01) return;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    });

    ctx.restore();
  }

  /**
   * Draw a soft radial gradient glow at (x, y).
   * Uses a cached gradient created at origin + ctx.translate for positioning.
   */
  private _drawGlow(
    x: number,
    y: number,
    size: number,
    opacity: number,
    color: string,
  ): void {
    const { ctx, config } = this;
    const glowRadius = size * config.glowScale;
    const bucket = gradientBucket(size);
    const key = `${bucket}_${color}`;

    let gradient = this._gradientCache.get(key);
    if (!gradient) {
      // Create gradient centered at origin — we translate per particle
      gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bucket * config.glowScale);
      gradient.addColorStop(0, colorWithAlpha(color, config.glowIntensity));
      gradient.addColorStop(1, colorWithAlpha(color, 0));
      this._gradientCache.set(key, gradient);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(-glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.restore();
  }

  // ── Shape Primitives ────────────────────────────────────────

  /**
   * Draw a connection line between two points.
   */
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    opacity: number,
    width: number = 1,
    color: string = '#ffffff',
  ): void {
    const { ctx, dpr } = this;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = colorWithAlpha(color, opacity * 0.4);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a contour circle (e.g. cluster boundary, ring indicator).
   */
  drawCircle(
    cx: number,
    cy: number,
    r: number,
    opacity: number,
    lineWidth: number = 1,
    color: string = '#ffffff',
  ): void {
    const { ctx, dpr } = this;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = colorWithAlpha(color, opacity * 0.2);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Clear the gradient cache (call on context loss or major config change).
   */
  clearCache(): void {
    this._gradientCache.clear();
    this._cacheCtx = null;
  }
}
