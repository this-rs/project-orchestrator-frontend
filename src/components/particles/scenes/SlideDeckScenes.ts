/**
 * Slide Deck Scenes — 4 split-panel comparison visualizations.
 *
 * These are progress-driven scenes for the presentation slide deck.
 * Each compares two approaches side-by-side:
 *   - FocusSplitScene (slide 3/15): dispersé vs focalisé
 *   - PromptOutputPhaseScene (slide 5/15): 3 dots → box → explosion
 *   - HumanAISplitScene (slide 9/15): ×1 vs ×50
 *   - DelegationSplitScene (slide 14/15): séquentiel vs parallèle
 *
 * All scenes implement ParticleScene and use the renderer utilities.
 */

import { ParticlePool } from '../engine/ParticlePool';
import { ParticleEngine } from '../engine/ParticleEngine';
import { NoiseForce, DragForce } from '../engine/forces';
import type { Particle } from '../engine/types';
import { TAU } from '../engine/types';
import {
  renderTrail,
  renderGlowDot,
  renderRing,
  renderLine,
} from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { clamp, easeInOutCubic, easeInOut, easeInQuad, lerp, smoothstep } from './types';

// ═══════════════════════════════════════════════════════════════
// 1. FocusSplitScene — "même énergie, résultat radicalement différent"
// ═══════════════════════════════════════════════════════════════

const FOCUS_COUNT = 40;
const TRAIL_LEN = 5;

interface FocusDot {
  scatterX: number;
  scatterY: number;
  targetX: number;
  targetY: number;
  trail: { x: number; y: number }[];
}

export class FocusSplitScene implements ParticleScene {
  readonly name = 'focus-split';
  readonly title = 'FOCUS';
  readonly description =
    'Même énergie, résultat radicalement différent — dispersé vs focalisé';

  private leftPool!: ParticlePool;
  private leftEngine!: ParticleEngine;
  private rightDots: FocusDot[] = [];
  private w = 0;
  private h = 0;
  private progress = 0;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuild(width, height);
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rebuild(width, height);
  }

  private rebuild(width: number, height: number): void {
    const halfW = width / 2;

    // Left: noise-driven brownian particles
    this.leftPool = new ParticlePool(FOCUS_COUNT);
    this.leftEngine = new ParticleEngine(this.leftPool, 0.96);
    this.leftEngine.addForce(new NoiseForce({ frequency: 0.008, amplitude: 80, speed: 0.3 }));
    this.leftEngine.addForce(new DragForce({ coefficient: 2 }));

    for (let i = 0; i < FOCUS_COUNT; i++) {
      this.leftPool.spawn({
        x: 30 + Math.random() * (halfW - 60),
        y: 30 + Math.random() * (height - 60),
        size: 1.5 + Math.random() * 1.5,
        opacity: 0.5 + Math.random() * 0.3,
        color: '#ffffff',
        maxLife: 9999,
      });
    }

    // Right: procedural convergence with trails
    const tgtX = halfW + halfW * 0.7;
    const tgtY = height * 0.5;
    this.rightDots = [];

    for (let i = 0; i < FOCUS_COUNT; i++) {
      const trail: { x: number; y: number }[] = [];
      const sx = halfW + 30 + Math.random() * (halfW - 60);
      const sy = 30 + Math.random() * (height - 60);
      for (let j = 0; j < TRAIL_LEN; j++) trail.push({ x: sx, y: sy });

      const t = i / FOCUS_COUNT;
      this.rightDots.push({
        scatterX: sx,
        scatterY: sy,
        targetX: tgtX + (t - 0.5) * 8,
        targetY: tgtY + (t - 0.5) * 60,
        trail,
      });
    }
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    const halfW = this.w / 2;

    // Left: step noise engine + boundary clamp
    this.leftEngine.step(dt, time);
    this.leftPool.forEachActive((p: Particle) => {
      if (p.x < 10) p.x = 10;
      if (p.x > halfW - 20) p.x = halfW - 20;
      if (p.y < 10) p.y = 10;
      if (p.y > this.h - 10) p.y = this.h - 10;
    });

    // Right: lerp scatter → beam
    const phase = clamp((progress - 0.3) / 0.4, 0, 1);
    const ep = easeInOutCubic(phase);

    for (const rp of this.rightDots) {
      const x = rp.scatterX + (rp.targetX - rp.scatterX) * ep;
      const y = rp.scatterY + (rp.targetY - rp.scatterY) * ep;
      for (let j = TRAIL_LEN - 1; j > 0; j--) {
        rp.trail[j].x = rp.trail[j - 1].x;
        rp.trail[j].y = rp.trail[j - 1].y;
      }
      rp.trail[0].x = x;
      rp.trail[0].y = y;
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const halfW = width / 2;
    const phase = clamp((this.progress - 0.3) / 0.4, 0, 1);
    const ep = easeInOutCubic(phase);

    // Divider
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Left: scattered ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, height);
    ctx.clip();
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 4;
    this.leftPool.forEachActive((p: Particle) => {
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    renderLabel(ctx, { text: 'dispersé', x: halfW / 2, y: height - 30, opacity: 0.5, size: 11 });
    ctx.restore();

    // ── Right: focused ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, halfW, height);
    ctx.clip();

    const tgtX = halfW + halfW * 0.7;
    const tgtY = height * 0.5;
    const ringOp = easeInOut(phase) * 0.5;
    renderRing(ctx, tgtX, tgtY, 25, ringOp, '#22d3ee');
    renderRing(ctx, tgtX, tgtY, 35, ringOp * 0.5, '#22d3ee');

    for (const rp of this.rightDots) {
      if (ep > 0.05) renderTrail(ctx, rp.trail, 0.3 * ep, 1.2, '#ffffff');
      renderGlowDot(ctx, rp.trail[0].x, rp.trail[0].y, 1.5 + ep * 0.5, 0.6 + ep * 0.3, '#ffffff', 6);
    }

    renderLabel(ctx, { text: 'focalisé', x: halfW + halfW / 2, y: height - 30, opacity: 0.5, size: 11 });
    ctx.restore();

    renderTitle(ctx, 'FOCUS', width, 0.5);
  }

  dispose(): void {
    this.leftEngine?.reset();
    this.rightDots = [];
  }

  setData(_data: unknown): void {}
}

// ═══════════════════════════════════════════════════════════════
// 2. PromptOutputPhaseScene — "3 mots en entrée, un monde en sortie"
// ═══════════════════════════════════════════════════════════════

const DOT_COUNT = 3;
const BURST_COUNT = 80;

interface BurstDot {
  dirX: number;
  dirY: number;
  speed: number;
  size: number;
  isCyan: boolean;
}

export class PromptOutputPhaseScene implements ParticleScene {
  readonly name = 'prompt-output-phase';
  readonly title = 'PROMPT → OUTPUT';
  readonly description = '3 mots en entrée, un monde en sortie — input amplification';

  private burst: BurstDot[] = [];
  private progress = 0;
  private time = 0;

  init(_w: number, _h: number): void {
    this.burst = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (TAU * i) / BURST_COUNT + (Math.random() - 0.5) * 0.3;
      this.burst.push({
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
        speed: 80 + Math.random() * 200,
        size: lerp(2, 5, Math.random()),
        isCyan: Math.random() > 0.8,
      });
    }
  }

  resize(_w: number, _h: number): void {}

  update(_dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const p = this.progress;
    const t = this.time;
    const cx = width / 2;
    const cy = height / 2;
    const margin = width * 0.12;
    const spacing = 30;
    const boxW = 60;
    const boxH = 40;

    // Phase 1: Input dots (0-20%)
    const inputOp = smoothstep(0, 0.15, p);
    const dotVisible = p < 0.55;

    for (let i = 0; i < DOT_COUNT; i++) {
      const startX = margin + i * spacing;
      const transit = clamp((p - 0.2) / 0.3, 0, 1);
      const eT = easeInQuad(transit);
      const dotX = lerp(startX, cx, eT);

      if (dotVisible) {
        renderGlowDot(ctx, dotX, cy, 5, inputOp, '#ffffff', 10);
        if (transit > 0.05 && transit < 1) {
          for (let j = 1; j <= 4; j++) {
            const tp = clamp(transit - j * 0.04, 0, 1);
            const trX = lerp(startX, cx, easeInQuad(tp));
            ctx.globalAlpha = inputOp * (1 - j / 5) * 0.4;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(trX, cy, 3, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    if (dotVisible && inputOp > 0.01) {
      renderLabel(ctx, { text: 'in: 3', x: margin + spacing, y: cy + 30, opacity: inputOp * 0.6, size: 10 });
    }

    // Processing box
    if (p > 0.15) {
      const isProc = p > 0.5 && p < 0.65;
      const glow = p > 0.5 ? 0.3 + 0.2 * Math.sin(t * 8) : 0.15;
      const border = p > 0.5 ? '#22d3ee' : '#444444';

      ctx.globalAlpha = glow;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
      ctx.globalAlpha = p > 0.5 ? 0.6 : 0.2;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

      if (isProc) {
        ctx.globalAlpha = glow * 0.5;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 20;
        ctx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    if (p > 0.1 && p < 0.55) {
      renderLine(ctx, margin + DOT_COUNT * spacing, cy, cx - boxW / 2 - 5, cy, 0.15, 1, '#444444');
    }

    // Phase 4: Explosion (60-100%)
    const ep = clamp((p - 0.6) / 0.4, 0, 1);
    if (ep > 0) {
      ctx.shadowColor = 'rgba(255,255,255,0.3)';
      ctx.shadowBlur = 4;
      for (const bp of this.burst) {
        const dist = bp.speed * ep * ep;
        const px = cx + bp.dirX * dist;
        const py = cy + bp.dirY * dist;
        if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;
        ctx.globalAlpha = (1 - ep * 0.5) * 0.8;
        ctx.fillStyle = bp.isCyan ? '#22d3ee' : '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, bp.size * (1 - ep * 0.3), 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      renderLabel(ctx, { text: 'output', x: cx, y: cy + boxH / 2 + 40, opacity: smoothstep(0.65, 0.75, p) * 0.6, size: 10 });
    }

    renderTitle(ctx, 'PROMPT → OUTPUT', width, 0.5);
  }

  dispose(): void {
    this.burst = [];
  }

  setData(_data: unknown): void {}
}

// ═══════════════════════════════════════════════════════════════
// 3. HumanAISplitScene — "même personne, output multiplié par 50"
// ═══════════════════════════════════════════════════════════════

const GOLDEN_ANGLE = 2.399963;
const SOLO_ORBITS = 4;
const SPIRAL_POOL_SIZE = 50;
const SPIRAL_LIFE = 3;
const SPIRAL_SPAWN_INTERVAL = 0.05;

interface Spiral {
  angle: number;
  orbitR: number;
  born: number;
  active: boolean;
}

export class HumanAISplitScene implements ParticleScene {
  readonly name = 'human-ai-split';
  readonly title = 'HUMAN + AI';
  readonly description = 'Même personne, output multiplié par 50';

  private spirals: Spiral[] = [];
  private spawnAngle = 0;
  private lastSpawn = 0;
  private time = 0;

  init(_w: number, _h: number): void {
    this.spirals = [];
    for (let i = 0; i < SPIRAL_POOL_SIZE; i++) {
      this.spirals.push({ angle: 0, orbitR: 0, born: -999, active: false });
    }
    this.spawnAngle = 0;
    this.lastSpawn = 0;
  }

  resize(_w: number, _h: number): void {}

  update(dt: number, _progress: number, time: number): void {
    this.time = time;

    // Spawn new spirals
    if (time - this.lastSpawn > SPIRAL_SPAWN_INTERVAL) {
      this.lastSpawn = time;
      for (const s of this.spirals) {
        if (!s.active) {
          s.angle = this.spawnAngle;
          s.orbitR = 8;
          s.born = time;
          s.active = true;
          this.spawnAngle += GOLDEN_ANGLE;
          break;
        }
      }
    }

    // Update spirals
    for (const s of this.spirals) {
      if (!s.active) continue;
      if (time - s.born > SPIRAL_LIFE) { s.active = false; continue; }
      s.orbitR += 25 * dt;
      s.angle += 2.5 * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const halfW = width / 2;
    const time = this.time;

    // Divider
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Left: Solo ×1 ──
    const soloCx = halfW * 0.5;
    const soloCy = height * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, height);
    ctx.clip();

    renderGlowDot(ctx, soloCx, soloCy, 5, 0.9, '#ffffff', 8);
    for (let i = 0; i < SOLO_ORBITS; i++) {
      const th = (TAU * i) / SOLO_ORBITS + 0.8 * time;
      renderGlowDot(ctx, soloCx + 30 * Math.cos(th), soloCy + 30 * Math.sin(th), 2, 0.5, '#ffffff', 4);
    }
    renderLabel(ctx, { text: '×1', x: soloCx, y: height - 30, opacity: 0.5, size: 13 });
    ctx.restore();

    // ── Right: Human + AI ×50 ──
    const rCx = halfW + halfW * 0.5;
    const hX = rCx - 40, hY = height * 0.5;
    const aX = rCx + 40, aY = height * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, halfW, height);
    ctx.clip();

    renderLine(ctx, hX, hY, aX, aY, 0.4, 1.5, '#ffffff');
    renderGlowDot(ctx, hX, hY, 5, 0.9, '#ffffff', 8);
    renderGlowDot(ctx, aX, aY, 6, 1, '#22d3ee', 16);

    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 3;
    for (const s of this.spirals) {
      if (!s.active) continue;
      const age = time - s.born;
      const frac = age / SPIRAL_LIFE;
      ctx.globalAlpha = (1 - frac) * 0.7;
      ctx.fillStyle = frac < 0.3 ? '#22d3ee' : '#ffffff';
      ctx.beginPath();
      ctx.arc(aX + s.orbitR * Math.cos(s.angle), aY + s.orbitR * Math.sin(s.angle), 1.5 * (1 - frac * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    renderLabel(ctx, { text: '×50', x: rCx, y: height - 30, opacity: 0.5, size: 13 });
    ctx.restore();

    renderTitle(ctx, 'HUMAN + AI', width, 0.5);
  }

  dispose(): void { this.spirals = []; }
  setData(_data: unknown): void {}
}

// ═══════════════════════════════════════════════════════════════
// 4. DelegationSplitScene — "un cerveau délègue, 6 agents"
// ═══════════════════════════════════════════════════════════════

const AGENTS = 6;

export class DelegationSplitScene implements ParticleScene {
  readonly name = 'delegation-split';
  readonly title = 'DELEGATION';
  readonly description = 'Un cerveau délègue — séquentiel vs parallèle';

  private progress = 0;

  init(_w: number, _h: number): void {}
  resize(_w: number, _h: number): void {}

  update(_dt: number, progress: number, _time: number): void {
    this.progress = progress;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const p = this.progress;
    const halfW = width / 2;
    const topY = height * 0.25;
    const botY = height * 0.7;
    const sp = (halfW - 80) / (AGENTS - 1);

    // Divider
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Left: Sequential ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, height);
    ctx.clip();

    const seqCx = halfW / 2;
    renderGlowDot(ctx, seqCx, topY, 6, 0.9, '#22d3ee', 12);

    const active = Math.floor(p * AGENTS) % AGENTS;
    for (let i = 0; i < AGENTS; i++) {
      const ax = 40 + i * sp;
      const on = i === active;
      if (on) renderLine(ctx, seqCx, topY + 8, ax, botY - 8, 0.4, 1.5, '#22d3ee');
      renderGlowDot(ctx, ax, botY, on ? 6 : 4, on ? 1 : 0.3, on ? '#ffffff' : '#666666', on ? 10 : 4);
    }
    renderLabel(ctx, { text: 'séquentiel', x: seqCx, y: height - 24, opacity: 0.5, size: 10 });
    ctx.restore();

    // ── Right: Parallel ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, halfW, height);
    ctx.clip();

    const parCx = halfW + halfW / 2;
    renderGlowDot(ctx, parCx, topY, 6, 0.9, '#22d3ee', 12);

    for (let i = 0; i < AGENTS; i++) {
      const ax = halfW + 40 + i * sp;
      // Tripled stagger (decision: 0.3 spread for visible cascade ≈80ms)
      const stagger = (i / AGENTS) * 0.3;
      const fan = smoothstep(0.1 + stagger, 0.1 + stagger + 0.15, p);
      renderLine(ctx, parCx, topY + 8, ax, botY - 8, fan * 0.4, 1.5, '#22d3ee');

      const ao = smoothstep(0.3 + i * 0.02, 0.35 + i * 0.02, p);
      renderGlowDot(ctx, ax, botY, ao > 0.5 ? 6 : 4, Math.max(0.3, ao), ao > 0.5 ? '#ffffff' : '#666666', ao > 0.5 ? 10 : 4);
    }
    renderLabel(ctx, { text: 'parallèle', x: parCx, y: height - 24, opacity: 0.5, size: 10 });
    ctx.restore();

    renderTitle(ctx, 'DELEGATION', width, 0.5);
  }

  dispose(): void {}
  setData(_data: unknown): void {}
}
