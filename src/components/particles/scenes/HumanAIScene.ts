/**
 * HumanAIScene — slide 9/15
 * "HUMAN + AI — même personne, output multiplié par 50"
 *
 * Split left/right:
 *   Left (×1):  1 central dot + 3–4 particles orbiting slowly
 *   Right (×50): 1 human dot connected to 1 AI dot (strong glow)
 *                AI emits particles in golden-angle spiral (~50 active)
 *
 * Continuous animation, no progress phases.
 */

import { renderGlowDot, renderLine, renderRing } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';

// ── Constants ────────────────────────────────────────────────
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 137.5 * (Math.PI / 180); // ≈ 2.399 rad
const SOLO_ORBIT_COUNT = 4;
const SOLO_ORBIT_R = 30;
const SOLO_OMEGA = 0.8; // rad/s

const AI_SPIRAL_MAX = 50;
const AI_SPAWN_RATE = 2; // particles per frame
const AI_EXPANSION_RATE = 20; // px/s orbit radius growth
const AI_OMEGA = 2.5; // rad/s angular speed

// ── Pre-allocated spiral particle ────────────────────────────
interface SpiralParticle {
  active: boolean;
  orbitR: number;
  theta: number;
  x: number;
  y: number;
  life: number; // 0..1, decays
  size: number;
  opacity: number;
}

// ── Scene ────────────────────────────────────────────────────

export class HumanAIScene implements ParticleScene {
  readonly name = 'human-ai';
  readonly title = 'HUMAN + AI';
  readonly description =
    'Same person, output multiplied by 50 — solo vs AI-augmented';

  private w = 0;
  private h = 0;
  private time = 0;

  // Left panel
  private soloCx = 0;
  private soloCy = 0;

  // Right panel
  private humanCx = 0;
  private humanCy = 0;
  private aiCx = 0;
  private aiCy = 0;

  // AI spiral emission
  private spiralParticles: SpiralParticle[] = [];
  private spawnAngle = 0;
  private spawnAccum = 0;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
    this.spawnAngle = 0;
    this.spawnAccum = 0;

    // Pre-allocate spiral pool
    this.spiralParticles = [];
    for (let i = 0; i < AI_SPIRAL_MAX + 10; i++) {
      this.spiralParticles.push({
        active: false,
        orbitR: 0,
        theta: 0,
        x: 0,
        y: 0,
        life: 0,
        size: 1 + Math.random() * 1.5,
        opacity: 0.3 + Math.random() * 0.4,
      });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
  }

  update(dt: number, _progress: number, time: number): void {
    this.time = time;

    // ── AI spiral: spawn new particles ──
    this.spawnAccum += AI_SPAWN_RATE;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      this.spawnSpiralParticle();
    }

    // ── AI spiral: update existing ──
    for (let i = 0; i < this.spiralParticles.length; i++) {
      const sp = this.spiralParticles[i];
      if (!sp.active) continue;

      sp.orbitR += AI_EXPANSION_RATE * dt;
      sp.theta += AI_OMEGA * dt;
      sp.x = this.aiCx + sp.orbitR * Math.cos(sp.theta);
      sp.y = this.aiCy + sp.orbitR * Math.sin(sp.theta);
      sp.life -= dt * 0.15; // ~6.7s lifetime

      if (sp.life <= 0 || sp.orbitR > Math.min(this.w, this.h) * 0.35) {
        sp.active = false;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { time, soloCx, soloCy, humanCx, humanCy, aiCx, aiCy } = this;
    const midX = width / 2;

    // ── Divider ──
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ══════════════════════════════════════════════
    // LEFT PANEL — Solo (×1)
    // ══════════════════════════════════════════════

    // Central dot
    const soloPulse = 0.7 + 0.15 * Math.sin(time * 1.5);
    renderGlowDot(ctx, soloCx, soloCy, 5 * soloPulse, 0.7, '#ffffff', 10);

    // Orbiting particles
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 2;
    for (let i = 0; i < SOLO_ORBIT_COUNT; i++) {
      const theta = (TAU * i) / SOLO_ORBIT_COUNT + SOLO_OMEGA * time;
      const ox = soloCx + Math.cos(theta) * SOLO_ORBIT_R;
      const oy = soloCy + Math.sin(theta) * SOLO_ORBIT_R;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, 2, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ×1 label
    renderLabel(ctx, {
      text: '×1',
      x: soloCx,
      y: soloCy + 50,
      opacity: 0.5,
      size: 12,
    });

    // ══════════════════════════════════════════════
    // RIGHT PANEL — Human + AI (×50)
    // ══════════════════════════════════════════════

    // Connection line: human → AI
    renderLine(ctx, humanCx, humanCy, aiCx, aiCy, 0.4, 1.5, '#22d3ee');

    // Human dot
    renderGlowDot(ctx, humanCx, humanCy, 5, 0.7, '#ffffff', 10);

    // AI dot (strong glow)
    const aiPulse = 0.8 + 0.2 * Math.sin(time * 3);
    renderGlowDot(ctx, aiCx, aiCy, 6 * aiPulse, 0.9, '#22d3ee', 22);
    renderRing(
      ctx,
      aiCx,
      aiCy,
      16 + 3 * Math.sin(time * 2),
      0.2,
      '#22d3ee',
    );

    // Spiral particles
    ctx.shadowColor = 'rgba(34,211,238,0.3)';
    ctx.shadowBlur = 3;

    for (let i = 0; i < this.spiralParticles.length; i++) {
      const sp = this.spiralParticles[i];
      if (!sp.active) continue;
      const alpha = sp.opacity * sp.life;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sp.life > 0.5 ? '#22d3ee' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ×50 label
    renderLabel(ctx, {
      text: '×50',
      x: (humanCx + aiCx) / 2,
      y: Math.max(humanCy, aiCy) + 50,
      opacity: 0.5,
      size: 12,
      color: '#22d3ee',
    });

    // ── Title ──
    renderTitle(ctx, 'HUMAN + AI', width, 0.5);
  }

  dispose(): void {
    this.spiralParticles = [];
  }

  setData(_data: unknown): void {
    // No external data needed
  }

  private computeLayout(): void {
    const { w, h } = this;
    // Left panel center
    this.soloCx = w * 0.25;
    this.soloCy = h * 0.5;
    // Right panel: human left-ish, AI right-ish
    this.humanCx = w * 0.6;
    this.humanCy = h * 0.5;
    this.aiCx = w * 0.82;
    this.aiCy = h * 0.5;
  }

  private spawnSpiralParticle(): void {
    // Find inactive slot
    for (let i = 0; i < this.spiralParticles.length; i++) {
      const sp = this.spiralParticles[i];
      if (sp.active) continue;

      sp.active = true;
      sp.orbitR = 8;
      sp.theta = this.spawnAngle;
      sp.x = this.aiCx + sp.orbitR * Math.cos(sp.theta);
      sp.y = this.aiCy + sp.orbitR * Math.sin(sp.theta);
      sp.life = 1;
      sp.size = 1 + Math.random() * 1.5;
      sp.opacity = 0.3 + Math.random() * 0.4;

      this.spawnAngle += GOLDEN_ANGLE;
      return;
    }
  }
}
