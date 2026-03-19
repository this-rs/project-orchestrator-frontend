/**
 * LeverageScene — Slide 1/15: "LEVERAGE — petit effort → grand impact"
 *
 * Beam pivoting on fulcrum triangle. Small cyan ball (left) pushes down,
 * big white ball (right) lifts up. Multiplier ×1→×10 animates with progress.
 * Downward pulsing arrow on the small ball.
 *
 * Corrected physics (per decision):
 *   - Normalized torque → angle mapping (not atan2 with mixed units)
 *   - Multiplier ×1→×10 (matches m₁ = lerp(m₂, m₂*0.1, progress))
 *
 * Ambient dust via internal ParticlePool + ParticleEngine.
 */

import type { ParticleScene } from './types';
import { ParticlePool, ParticleEngine, NoiseForce, DragForce, TAU } from '../engine';
import { renderParticles } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

// ── Constants ──────────────────────────────────────────────

const BEAM_COLOR = 'rgba(255, 255, 255, 0.85)';
const FULCRUM_COLOR = 'rgba(255, 255, 255, 0.6)';
const SMALL_BALL_COLOR = '#22d3ee';
const BIG_BALL_COLOR = 'rgba(255, 255, 255, 0.8)';
const ARROW_COLOR = '#22d3ee';
const ACCENT = '#22d3ee';
const MAX_ANGLE = (20 * Math.PI) / 180; // 20° max tilt
const DUST_COUNT = 40;
const DUST_POOL_SIZE = 80;

// ── Easing ─────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Scene ──────────────────────────────────────────────────

export class LeverageScene implements ParticleScene {
  readonly name = 'leverage';
  readonly title = 'LEVERAGE';
  readonly description = 'Beam balance — small effort, big impact.';

  private w = 0;
  private h = 0;

  // Physics state
  private angle = 0;
  private multiplier = 1;
  private time = 0;
  private readonly m2 = 1;

  // Layout
  private cx = 0;
  private cy = 0;
  private beamLength = 0;
  private fulcrumSize = 0;
  private smallRadius = 0;
  private bigRadius = 0;
  private scale = 1;

  // Ambient dust
  private pool: ParticlePool | null = null;
  private engine: ParticleEngine | null = null;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();

    // Ambient dust particles
    this.pool = new ParticlePool(DUST_POOL_SIZE);
    this.engine = new ParticleEngine(this.pool, 0.96);
    this.engine.addForce(new NoiseForce({ frequency: 0.005, amplitude: 15, speed: 0.2 }));
    this.engine.addForce(new DragForce({ coefficient: 0.3 }));

    for (let i = 0; i < DUST_COUNT; i++) {
      this.spawnDust();
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
    this.cy = this.h * 0.55;
    this.beamLength = 240 * this.scale;
    this.fulcrumSize = 18 * this.scale;
    this.smallRadius = 10 * this.scale;
    this.bigRadius = 40 * this.scale;
  }

  private spawnDust(): void {
    this.pool?.spawn({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      maxLife: 8 + Math.random() * 12,
      size: 0.5 + Math.random() * 1,
      opacity: 0.1 + Math.random() * 0.15,
      color: '#ffffff',
    });
  }

  update(dt: number, progress: number, time: number): void {
    this.time = time;

    const t = easeInOutCubic(progress);

    // m₁ decreases from m₂ to 0.1·m₂ → multiplier ×1→×10
    const m1 = lerp(this.m2, this.m2 * 0.1, t);
    this.multiplier = this.m2 / m1;

    // Normalized torque → angle
    const maxDiff = this.m2 * 0.9;
    const diff = this.m2 - m1;
    this.angle = (diff / maxDiff) * MAX_ANGLE;

    // Step dust physics
    if (this.engine && this.pool) {
      this.engine.step(dt, time);

      // Respawn dead dust
      const deficit = DUST_COUNT - this.pool.activeCount;
      for (let i = 0; i < Math.min(deficit, 2); i++) {
        this.spawnDust();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const {
      cx, cy, beamLength, fulcrumSize, smallRadius, bigRadius,
      angle, multiplier, time, scale,
    } = this;

    // ── Ambient dust ──────────────────────────────────
    if (this.pool) {
      renderParticles(ctx, this.pool, { glow: true, globalAlpha: 1 });
    }

    const halfBeam = beamLength / 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // ── Fulcrum triangle ──────────────────────────────
    const fh = fulcrumSize;
    const fw = fulcrumSize * 1.2;
    ctx.fillStyle = FULCRUM_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - fw / 2, cy + fh);
    ctx.lineTo(cx + fw / 2, cy + fh);
    ctx.closePath();
    ctx.fill();

    // ── Beam ──────────────────────────────────────────
    const leftX = cx - halfBeam * cosA;
    const leftY = cy + halfBeam * sinA;
    const rightX = cx + halfBeam * cosA;
    const rightY = cy - halfBeam * sinA;

    ctx.strokeStyle = BEAM_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.stroke();

    // ── Small ball (left, cyan) ───────────────────────
    const bLx = leftX;
    const bLy = leftY - smallRadius;

    ctx.shadowColor = SMALL_BALL_COLOR;
    ctx.shadowBlur = 12;
    ctx.fillStyle = SMALL_BALL_COLOR;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(bLx, bLy, smallRadius * 1.5, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(bLx, bLy, smallRadius, 0, TAU);
    ctx.fill();

    // ── Big ball (right, white) ───────────────────────
    const bRx = rightX;
    const bRy = rightY - bigRadius;

    ctx.shadowColor = BIG_BALL_COLOR;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = BIG_BALL_COLOR;
    ctx.beginPath();
    ctx.arc(bRx, bRy, bigRadius * 1.3, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(bRx, bRy, bigRadius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Downward arrow ────────────────────────────────
    const arrowLen = 25 * scale;
    const arrowTop = bLy - smallRadius - arrowLen - 8;
    const arrowBot = bLy - smallRadius - 4;
    const arrowHead = 6 * scale;
    const arrowPulse = 0.5 + 0.5 * Math.sin(time * 3);

    ctx.globalAlpha = 0.5 + arrowPulse * 0.5;
    ctx.strokeStyle = ARROW_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bLx, arrowTop);
    ctx.lineTo(bLx, arrowBot);
    ctx.stroke();

    ctx.fillStyle = ARROW_COLOR;
    ctx.beginPath();
    ctx.moveTo(bLx, arrowBot + 2);
    ctx.lineTo(bLx - arrowHead, arrowBot - arrowHead);
    ctx.lineTo(bLx + arrowHead, arrowBot - arrowHead);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Mass labels ───────────────────────────────────
    ctx.font = `${10 * scale}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('m\u2081', bLx, bLy + smallRadius + 12);
    ctx.fillText('m\u2082', bRx, bRy + bigRadius + 12);

    // ── Multiplier text (cyan accent) ─────────────────
    renderLabel(ctx, {
      text: `\u00D7${multiplier.toFixed(1)}`,
      x: cx,
      y: cy - fulcrumSize - 14,
      opacity: 0.9,
      size: 14,
      color: ACCENT,
    });

    // ── Title ─────────────────────────────────────────
    renderTitle(ctx, 'LEVERAGE', width, 0.5);

    // ── Subtitle ──────────────────────────────────────
    renderLabel(ctx, {
      text: 'petit effort \u2192 grand impact',
      x: width / 2,
      y: height - 24,
      opacity: 0.35,
      size: 10,
    });
  }

  dispose(): void {
    if (this.engine) this.engine.reset();
    this.pool = null;
    this.engine = null;
  }
}
