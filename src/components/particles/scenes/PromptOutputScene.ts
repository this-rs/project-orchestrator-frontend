/**
 * PromptOutputScene — slide 5/15
 * "PROMPT → OUTPUT — 3 mots en entrée, un monde en sortie"
 *
 * 4 phases:
 *   1. Input (0–20%):   3 big dots appear at left, label "in: 3"
 *   2. Transit (20–50%): dots move toward center box with trails
 *   3. Processing (50–60%): box pulses/glows
 *   4. Explosion (60–100%): BurstEmitter → ~80 particles expand from box
 *
 * Progress-driven (0..1), self-contained Canvas 2D.
 */

import { renderGlowDot } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { clamp, easeInQuad, lerp, smoothstep } from './types';

// ── Constants ────────────────────────────────────────────────
const INPUT_DOT_COUNT = 3;
const EXPLOSION_COUNT = 80;
const BOX_W = 60;
const BOX_H = 40;
const TAU = Math.PI * 2;

// ── Pre-allocated explosion particles ────────────────────────
interface ExplParticle {
  dirX: number;
  dirY: number;
  speed: number;
  size: number;
  randomSeed: number; // for opacity variance
}

// ── Scene ────────────────────────────────────────────────────

export class PromptOutputScene implements ParticleScene {
  readonly name = 'prompt-output';
  readonly title = 'PROMPT → OUTPUT';
  readonly description =
    '3 words in, a world out — input transit, processing, explosion';

  private w = 0;
  private h = 0;
  private time = 0;
  private progress = 0;

  // Input dot positions
  private dotStartX: number[] = [];
  private dotStartY: number[] = [];
  private dotSpacing = 0;

  // Box center
  private boxCx = 0;
  private boxCy = 0;

  // Explosion particles (pre-allocated at init)
  private explParticles: ExplParticle[] = [];

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
    this.initExplosion();
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  update(_dt: number, progress: number, time: number): void {
    this.time = time;
    this.progress = progress;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { progress, time, boxCx, boxCy } = this;

    // ── Phase calculations ──
    const inputOpacity = smoothstep(0, 0.15, progress);
    const transitProgress = clamp((progress - 0.2) / 0.3, 0, 1);
    const transitEased = easeInQuad(transitProgress);
    const isProcessing = progress >= 0.5 && progress < 0.6;
    const explosionProgress = clamp((progress - 0.6) / 0.4, 0, 1);

    // ── Box (always visible after transit starts) ──
    if (progress >= 0.15) {
      const boxAlpha = smoothstep(0.15, 0.25, progress) * 0.15;
      const glow = isProcessing
        ? 0.3 + 0.2 * Math.sin(time * 8)
        : boxAlpha;

      ctx.globalAlpha = glow;
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(boxCx - BOX_W / 2, boxCy - BOX_H / 2, BOX_W, BOX_H);

      // Box border
      ctx.globalAlpha = glow * 2;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxCx - BOX_W / 2, boxCy - BOX_H / 2, BOX_W, BOX_H);
      ctx.globalAlpha = 1;

      // Processing glow ring
      if (isProcessing) {
        const pulseR = 30 + 10 * Math.sin(time * 6);
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(time * 8);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(boxCx, boxCy, pulseR, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Input dots (phase 1 & 2: appear then transit) ──
    if (progress < 0.6) {
      for (let i = 0; i < INPUT_DOT_COUNT; i++) {
        const dotX = lerp(
          this.dotStartX[i],
          boxCx,
          transitEased,
        );
        const dotY = lerp(
          this.dotStartY[i],
          boxCy,
          transitEased,
        );

        // Fade out when reaching box
        const dotAlpha = inputOpacity * (1 - transitEased * 0.8);
        if (dotAlpha <= 0.01) continue;

        // Trail during transit
        if (transitProgress > 0 && transitProgress < 1) {
          const trailLen = 5;
          for (let j = 1; j <= trailLen; j++) {
            const tt = Math.max(0, transitEased - j * 0.04);
            const tx = lerp(this.dotStartX[i], boxCx, tt);
            const ty = lerp(this.dotStartY[i], boxCy, tt);
            const ta = dotAlpha * (1 - j / trailLen) * 0.3;
            renderGlowDot(ctx, tx, ty, 4, ta, '#ffffff', 6);
          }
        }

        renderGlowDot(ctx, dotX, dotY, 6, dotAlpha, '#ffffff', 14);
      }
    }

    // ── Input label ──
    if (progress < 0.55) {
      const labelAlpha = inputOpacity * (1 - clamp((progress - 0.4) / 0.15, 0, 1));
      if (labelAlpha > 0.01) {
        renderLabel(ctx, {
          text: 'IN: 3',
          x: width * 0.12,
          y: height * 0.5,
          opacity: labelAlpha * 0.5,
          size: 11,
          color: '#ffffff',
        });
      }
    }

    // ── Explosion (phase 4) ──
    if (explosionProgress > 0) {
      ctx.shadowColor = 'rgba(34,211,238,0.3)';
      ctx.shadowBlur = 4;

      const ep2 = explosionProgress * explosionProgress;

      for (let j = 0; j < EXPLOSION_COUNT; j++) {
        const ep = this.explParticles[j];
        const px = boxCx + ep.dirX * ep.speed * ep2 * 200;
        const py = boxCy + ep.dirY * ep.speed * ep2 * 200;
        const alpha = (1 - explosionProgress * 0.5) * (0.5 + ep.randomSeed * 0.5);
        const size = lerp(2, 5, ep.randomSeed) * (1 - explosionProgress * 0.3);

        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ep.randomSeed > 0.7 ? '#22d3ee' : '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, size, 0, TAU);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Output label
      const outAlpha = smoothstep(0.65, 0.8, progress) * 0.5;
      renderLabel(ctx, {
        text: 'OUTPUT',
        x: width * 0.85,
        y: height * 0.5,
        opacity: outAlpha,
        size: 11,
        color: '#22d3ee',
      });
    }

    // ── Title ──
    renderTitle(ctx, 'PROMPT → OUTPUT', width, 0.5);
  }

  dispose(): void {
    this.explParticles = [];
  }

  setData(_data: unknown): void {
    // No external data needed
  }

  private computeLayout(): void {
    const { w, h } = this;
    const margin = w * 0.1;
    this.dotSpacing = h * 0.15;
    this.boxCx = w * 0.5;
    this.boxCy = h * 0.5;

    this.dotStartX = [];
    this.dotStartY = [];
    for (let i = 0; i < INPUT_DOT_COUNT; i++) {
      this.dotStartX.push(margin);
      this.dotStartY.push(h * 0.5 + (i - 1) * this.dotSpacing);
    }
  }

  private initExplosion(): void {
    this.explParticles = [];
    for (let j = 0; j < EXPLOSION_COUNT; j++) {
      const angle = (j / EXPLOSION_COUNT) * TAU + (Math.random() - 0.5) * 0.3;
      this.explParticles.push({
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
        speed: 0.5 + Math.random() * 1.0,
        size: 2 + Math.random() * 3,
        randomSeed: Math.random(),
      });
    }
  }
}
