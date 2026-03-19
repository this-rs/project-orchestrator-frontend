/**
 * ContextWindowScene — Slide 6/15:
 *   "CONTEXT WINDOW — la mémoire a une limite — les anciens tokens disparaissent"
 *
 * Large circle (context window boundary). Tokens appear as dots on an inner ring,
 * spawning one-by-one. Counter "N/M" at center. When full, oldest tokens
 * fade out (FIFO eviction) as new ones arrive. Evicted tokens turn cyan and shrink.
 *
 * Token positions are deterministic (slot on ring), no physics needed.
 */

import type { ParticleScene } from './types';
import { TAU } from '../engine';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

// ── Constants ──────────────────────────────────────────────

const MAX_TOKENS = 16;
const SPAWN_INTERVAL = 0.6; // seconds
const FADE_IN = 0.3; // seconds
const FADE_OUT = 0.5; // seconds
const RING_COLOR = 'rgba(255, 255, 255, 0.15)';
const INNER_RING_COLOR = 'rgba(255, 255, 255, 0.06)';
const TOKEN_COLOR = '#ffffff';
const EVICT_COLOR = '#22d3ee';
const ACCENT = '#22d3ee';

// ── Token struct ───────────────────────────────────────────

interface Token {
  slot: number;
  spawnTime: number;
  evictTime: number; // 0 = not evicted
  active: boolean;
}

// ── Easing ─────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ── Scene ──────────────────────────────────────────────────

export class ContextWindowScene implements ParticleScene {
  readonly name = 'contextWindow';
  readonly title = 'CONTEXT WINDOW';
  readonly description = 'Token ring with FIFO eviction.';

  private w = 0;
  private h = 0;
  private time = 0;

  // Layout
  private cx = 0;
  private cy = 0;
  private outerRadius = 0;
  private innerRadius = 0;
  private scale = 1;

  // Token state (pre-allocated)
  private tokens: Token[] = [];
  private nextSlot = 0;
  private lastSpawnTime = -SPAWN_INTERVAL;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();

    this.tokens = [];
    this.nextSlot = 0;
    this.lastSpawnTime = -SPAWN_INTERVAL;
    for (let i = 0; i < MAX_TOKENS * 3; i++) {
      this.tokens.push({ slot: 0, spawnTime: 0, evictTime: 0, active: false });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  private computeLayout(): void {
    this.scale = Math.min(this.w, this.h) / 400;
    this.cx = this.w / 2;
    this.cy = this.h * 0.52;
    this.outerRadius = 110 * this.scale;
    this.innerRadius = 85 * this.scale;
  }

  private getVisibleCount(): number {
    let n = 0;
    for (const t of this.tokens) {
      if (t.active && t.evictTime === 0) n++;
    }
    return n;
  }

  private evictOldest(time: number): void {
    let oldest: Token | null = null;
    let oldestTime = Infinity;
    for (const t of this.tokens) {
      if (t.active && t.evictTime === 0 && t.spawnTime < oldestTime) {
        oldestTime = t.spawnTime;
        oldest = t;
      }
    }
    if (oldest) oldest.evictTime = time;
  }

  update(_dt: number, _progress: number, time: number): void {
    this.time = time;

    // ── Spawn ─────────────────────────────────────────
    if (time - this.lastSpawnTime >= SPAWN_INTERVAL) {
      this.lastSpawnTime = time;

      if (this.getVisibleCount() >= MAX_TOKENS) {
        this.evictOldest(time);
      }

      for (const tok of this.tokens) {
        if (!tok.active) {
          tok.slot = this.nextSlot % MAX_TOKENS;
          tok.spawnTime = time;
          tok.evictTime = 0;
          tok.active = true;
          this.nextSlot++;
          break;
        }
      }
    }

    // ── Cleanup fully faded ───────────────────────────
    for (const tok of this.tokens) {
      if (tok.active && tok.evictTime > 0 && time - tok.evictTime > FADE_OUT) {
        tok.active = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { cx, cy, outerRadius, innerRadius, scale, time, tokens } = this;

    // ── Title ─────────────────────────────────────────
    renderTitle(ctx, 'CONTEXT WINDOW', width, 0.5);

    // ── Outer circle ──────────────────────────────────
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, TAU);
    ctx.stroke();

    // ── Inner ring guide ──────────────────────────────
    ctx.strokeStyle = INNER_RING_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, TAU);
    ctx.stroke();

    // ── Tokens on inner ring ──────────────────────────
    for (const tok of tokens) {
      if (!tok.active) continue;

      const theta = (TAU * tok.slot) / MAX_TOKENS - Math.PI / 2; // top = slot 0
      const px = cx + innerRadius * Math.cos(theta);
      const py = cy + innerRadius * Math.sin(theta);

      let opacity = smoothstep(tok.spawnTime, tok.spawnTime + FADE_IN, time);
      let evicting = false;

      if (tok.evictTime > 0) {
        const fadeOut = 1 - smoothstep(tok.evictTime, tok.evictTime + FADE_OUT, time);
        opacity *= fadeOut;
        evicting = true;
      }

      if (opacity <= 0.01) continue;

      const sz = 4 * scale * (evicting ? opacity : 1);
      const color = evicting ? EVICT_COLOR : TOKEN_COLOR;

      ctx.globalAlpha = opacity;

      if (!evicting && opacity > 0.5) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // ── Counter N/M ───────────────────────────────────
    const visible = this.getVisibleCount();
    const isFull = visible >= MAX_TOKENS;

    renderLabel(ctx, {
      text: `${Math.min(visible, MAX_TOKENS)}/${MAX_TOKENS}`,
      x: cx,
      y: cy - 4,
      opacity: 0.9,
      size: 18,
      color: isFull ? ACCENT : '#ffffff',
    });

    renderLabel(ctx, {
      text: 'TOKENS',
      x: cx,
      y: cy + 18 * scale,
      opacity: 0.3,
      size: 8,
    });

    // ── Subtitle ──────────────────────────────────────
    renderLabel(ctx, {
      text: 'les anciens tokens disparaissent',
      x: width / 2,
      y: height - 24,
      opacity: 0.35,
      size: 10,
    });
  }

  dispose(): void {
    this.tokens = [];
  }
}
