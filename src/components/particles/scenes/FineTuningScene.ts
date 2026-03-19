/**
 * FineTuningScene — "lancer contre un mur vs reshaper la structure"
 *
 * Split view comparing two approaches:
 * Left — Prompting: ~30 particles thrown at a wall, bouncing chaotically
 * Right — Fine-tuning: ~30 particles converging to a 6×5 ordered grid
 */

import type { ParticleScene } from './types';
import { smoothstep, lerp, easeInOutCubic } from './types';
import {
  ParticlePool,
  ParticleEngine,
  NoiseForce,
  DragForce,
  BoundaryForce,
  TAU,
} from '../engine';
import type { Particle } from '../engine/types';
import { renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

const PARTICLES_PER_SIDE = 30;
const GRID_COLS = 6;
const GRID_ROWS = 5;
const MAX_CAPACITY = 80;

interface GridTarget {
  x: number;
  y: number;
}

export class FineTuningScene implements ParticleScene {
  readonly name = 'fine-tuning';
  readonly title = 'FINE-TUNING VS PROMPTING';
  readonly description = 'lancer contre un mur vs reshaper la structure';

  // Left side: prompting (bounce)
  private leftPool!: ParticlePool;
  private leftEngine!: ParticleEngine;
  // Right side: fine-tuning (grid)
  private rightPool!: ParticlePool;
  private rightEngine!: ParticleEngine;

  private gridTargets: GridTarget[] = [];
  private wallX = 0;
  private w = 0;
  private h = 0;
  private progress = 0;
  private initialized = false;

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;

    const halfW = width / 2;
    this.wallX = halfW - 25;

    // ── Left engine (prompting) ──
    this.leftPool = new ParticlePool(MAX_CAPACITY);
    this.leftEngine = new ParticleEngine(this.leftPool, 0.98);

    const leftNoise = new NoiseForce({
      frequency: 0.01,
      amplitude: 20,
      speed: 0.4,
    });
    const leftDrag = new DragForce({ coefficient: 1.5 });
    // Boundary: left side only, wall is the right boundary
    const leftBoundary = new BoundaryForce({
      left: 20,
      right: this.wallX,
      top: 60,
      bottom: height - 50,
      bounce: 0.7, // spec: bounce=0.7
    });

    this.leftEngine.addForce(leftNoise);
    this.leftEngine.addForce(leftDrag);
    this.leftEngine.addForce(leftBoundary);

    // ── Right engine (fine-tuning) ──
    this.rightPool = new ParticlePool(MAX_CAPACITY);
    this.rightEngine = new ParticleEngine(this.rightPool, 0.95);

    const rightNoise = new NoiseForce({
      frequency: 0.008,
      amplitude: 40,
      speed: 0.3,
    });
    const rightDrag = new DragForce({ coefficient: 3.5 });
    const rightBoundary = new BoundaryForce({
      left: halfW + 25,
      right: width - 20,
      top: 60,
      bottom: height - 50,
      bounce: 0.3,
    });

    this.rightEngine.addForce(rightNoise);
    this.rightEngine.addForce(rightDrag);
    this.rightEngine.addForce(rightBoundary);

    this.computeGrid();
    this.spawnParticles();
    this.initialized = true;
  }

  private computeGrid(): void {
    const { w, h } = this;
    const halfW = w / 2;
    const margin = 50;
    const areaLeft = halfW + margin;
    const areaRight = w - margin;
    const areaTop = 80;
    const areaBottom = h - 70;
    const cellW = (areaRight - areaLeft) / GRID_COLS;
    const cellH = (areaBottom - areaTop) / GRID_ROWS;

    this.gridTargets = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        this.gridTargets.push({
          x: areaLeft + (c + 0.5) * cellW,
          y: areaTop + (r + 0.5) * cellH,
        });
      }
    }
  }

  private spawnParticles(): void {
    const { w, h } = this;
    const halfW = w / 2;

    // ── Left: prompting particles driven rightward ──
    this.leftPool.reset();
    for (let i = 0; i < PARTICLES_PER_SIDE; i++) {
      this.leftPool.spawn({
        x: 30 + Math.random() * (halfW * 0.5),
        y: 70 + Math.random() * (h - 140),
        vx: 30 + Math.random() * 40, // rightward toward wall
        vy: (Math.random() - 0.5) * 25,
        size: 2,
        opacity: 0.6,
        color: '#ffffff',
        maxLife: 99999,
        group: 0,
      });
    }

    // ── Right: fine-tuning particles (scattered initially) ──
    this.rightPool.reset();
    for (let i = 0; i < PARTICLES_PER_SIDE; i++) {
      this.rightPool.spawn({
        x: halfW + 40 + Math.random() * (halfW - 80),
        y: 70 + Math.random() * (h - 140),
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        size: 2,
        opacity: 0.6,
        color: '#ffffff',
        maxLife: 99999,
        group: i, // index maps to grid target
      });
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    // Full re-init needed because boundary configs change
    if (this.initialized) {
      this.leftEngine.reset();
      this.rightEngine.reset();
      this.init(width, height);
    }
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    if (!this.initialized) return;

    // grid_phase = smoothstep(0.2, 0.8, progress) — spec
    const gridPhase = easeInOutCubic(smoothstep(0.2, 0.8, progress));

    // ── Left: constant rightward impulse (prompting = throwing at wall) ──
    this.leftPool.forEachActive((p: Particle) => {
      p.ax += 60; // constant push right
      p.ay += (Math.random() - 0.5) * 20; // vertical scatter
    });
    this.leftEngine.step(dt, time);

    // ── Right: spring toward grid targets ──
    // F_grid = -stiffness · grid_phase · (pos - target)
    const stiffness = lerp(0, 10, gridPhase);
    this.rightPool.forEachActive((p: Particle) => {
      const idx = p.group;
      if (idx >= 0 && idx < this.gridTargets.length) {
        const target = this.gridTargets[idx];
        p.ax += (target.x - p.x) * stiffness;
        p.ay += (target.y - p.y) * stiffness;
      }

      // Color shift: white → cyan as they align
      p.color = gridPhase > 0.5 ? '#22d3ee' : '#ffffff';
      p.opacity = lerp(0.6, 0.85, gridPhase);
    });
    this.rightEngine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) return;
    const { progress, gridTargets } = this;
    const halfW = width / 2;
    const gridPhase = easeInOutCubic(smoothstep(0.2, 0.8, progress));

    // ── Divider line (dashed) ──
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Wall (left side) ──
    renderLine(ctx, this.wallX, 55, this.wallX, height - 45, 0.3, 2, '#ffffff');

    // ── Left particles (prompting — chaotic bouncing) ──
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 4;
    this.leftPool.forEachActive((p: Particle) => {
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    // ── Grid target hints (right side, faint) ──
    if (gridPhase > 0.15) {
      const gridAlpha = smoothstep(0.15, 0.4, gridPhase) * 0.12;
      ctx.save();
      ctx.globalAlpha = gridAlpha;
      ctx.fillStyle = '#22d3ee';
      for (let i = 0; i < gridTargets.length; i++) {
        ctx.beginPath();
        ctx.arc(gridTargets[i].x, gridTargets[i].y, 1, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Right particles (fine-tuning — ordered) ──
    ctx.save();
    ctx.shadowColor = `rgba(34,211,238,${lerp(0, 0.4, gridPhase)})`;
    ctx.shadowBlur = lerp(2, 6, gridPhase);
    this.rightPool.forEachActive((p: Particle) => {
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(2, 2.5, gridPhase), 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    // ── Title ──
    renderTitle(ctx, this.title, width, 0.5);

    // ── Side labels ──
    renderLabel(ctx, {
      text: 'PROMPTING',
      x: halfW / 2,
      y: height - 28,
      opacity: 0.5,
      size: 10,
      align: 'center',
    });

    renderLabel(ctx, {
      text: 'FINE-TUNING',
      x: halfW + halfW / 2,
      y: height - 28,
      opacity: lerp(0.3, 0.7, gridPhase),
      size: 10,
      color: '#22d3ee',
      align: 'center',
    });
  }

  dispose(): void {
    if (this.leftPool) this.leftPool.reset();
    if (this.rightPool) this.rightPool.reset();
    this.gridTargets = [];
    this.initialized = false;
  }

  setData(_data: unknown): void {
    // Could accept custom grid dimensions
  }
}
