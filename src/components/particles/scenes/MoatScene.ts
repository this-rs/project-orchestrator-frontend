/**
 * MoatScene — Project Health visualization.
 *
 * Layout:
 *   CENTER: Concentric rings with global health % in the core
 *   LEFT:   Labels for layers 0, 2, 4 (even indices)
 *   RIGHT:  Labels for layers 1, 3, 5 (odd indices)
 *   Each label has: name + health%, description, health bar, connector line to ring
 *
 * Visual encoding:
 *   health -> color: cyan(1.0) -> orange(0.5) -> red(0.0)
 *   health -> movement: fluid(1.0) -> erratic jitter(0.0)
 */

import { TAU } from '../engine/types';
import { renderGlowDot, renderRing, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { smoothstep, clamp, lerp } from './types';

// ── Data ──────────────────────────────────────────────────────

export interface MoatData {
  layers: Array<{
    name: string;
    count: number;
    color?: string;
    /** Health score for this layer (0-1). 1 = healthy, 0 = critical */
    health?: number;
  }>;
  /** Global health score (0-1) */
  healthScore?: number;
}

const DEFAULT_DATA: MoatData = {
  layers: [
    { name: 'code', count: 8, health: 0.8 },
    { name: 'knowledge', count: 12, health: 0.6 },
    { name: 'skills', count: 16, health: 0.9 },
    { name: 'behavioral', count: 20, health: 0.4 },
    { name: 'neural', count: 24, health: 0.7 },
  ],
  healthScore: 0.68,
};

// ── Human-readable layer info ─────────────────────────────────

interface LayerMeta {
  label: string;
  desc: string;
}

const LAYER_META: Record<string, LayerMeta> = {
  code:       { label: 'Code',       desc: 'Files, functions, imports' },
  knowledge:  { label: 'Knowledge',  desc: 'Notes & decisions' },
  skills:     { label: 'Skills',     desc: 'Emergent patterns' },
  behavioral: { label: 'Behavioral', desc: 'Protocols & FSMs' },
  fabric:     { label: 'Fabric',     desc: 'Co-change relations' },
  neural:     { label: 'Neural',     desc: 'Synapses & energy' },
  notes:      { label: 'Notes',      desc: 'Knowledge base' },
  personas:   { label: 'Personas',   desc: 'Adaptive agents' },
  episodes:   { label: 'Episodes',   desc: 'Cognitive memory' },
};

// ── Constants ─────────────────────────────────────────────────

const CORE_RADIUS = 14;
const BASE_ORBIT_SPEED = 0.8;

// ── Health → Color ────────────────────────────────────────────

function healthToColor(health: number): string {
  const h = clamp(health, 0, 1);
  if (h >= 0.7) {
    const t = (h - 0.7) / 0.3;
    return `rgb(${Math.round(lerp(100, 34, t))},${Math.round(lerp(200, 211, t))},${Math.round(lerp(220, 238, t))})`;
  } else if (h >= 0.4) {
    const t = (h - 0.4) / 0.3;
    return `rgb(${Math.round(lerp(251, 100, t))},${Math.round(lerp(146, 200, t))},${Math.round(lerp(60, 220, t))})`;
  } else {
    const t = h / 0.4;
    return `rgb(${Math.round(lerp(248, 251, t))},${Math.round(lerp(113, 146, t))},${Math.round(lerp(113, 60, t))})`;
  }
}

// ── Particle ring data ────────────────────────────────────────

interface LayerParticle {
  angleOffset: number;
  sizeVariance: number;
  opacityVariance: number;
  jitterSeed: number;
}

interface LayerState {
  radius: number;
  speed: number;
  particles: LayerParticle[];
  name: string;
  displayName: string;
  desc: string;
  count: number;
  color: string;
  health: number;
}

// ── Scene ─────────────────────────────────────────────────────

export class MoatScene implements ParticleScene {
  readonly name = 'moat';
  readonly title = 'PROJECT HEALTH';
  readonly description = 'Knowledge graph layers — health & coverage';

  private data: MoatData = DEFAULT_DATA;
  private cx = 0;
  private cy = 0;
  private w = 0;
  private h = 0;
  private progress = 0;
  private time = 0;
  private healthScore = 0.68;
  private layerStates: LayerState[] = [];
  /** Once intro animation completes, lock progress to 1.0 — no more fade cycling */
  private introComplete = false;

  setData(data: unknown): void {
    const d = data as MoatData;
    if (d && Array.isArray(d.layers)) {
      this.data = d;
      this.healthScore = d.healthScore ?? 0.68;
      this.buildLayers();
    }
  }

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.buildLayers();
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cx = width * 0.5;
    this.cy = height * 0.5;
  }

  private buildLayers(): void {
    const { layers } = this.data;
    this.layerStates = [];

    // Max ring radius: leave room for labels on sides (~30% each side)
    const maxRadius = Math.min(this.w * 0.20, this.h * 0.32);
    const spacing = layers.length > 0
      ? Math.min(20, (maxRadius - CORE_RADIUS) / layers.length)
      : 20;

    for (let n = 0; n < layers.length; n++) {
      const layer = layers[n];
      const health = layer.health ?? 0.8;
      const particlesCount = 6 + n * 2;
      const particles: LayerParticle[] = [];

      for (let j = 0; j < particlesCount; j++) {
        particles.push({
          angleOffset: (TAU * j) / particlesCount,
          sizeVariance: 0.8 + Math.random() * 0.4,
          opacityVariance: 0.9 + Math.random() * 0.2,
          jitterSeed: Math.random() * TAU,
        });
      }

      const meta = LAYER_META[layer.name] ?? { label: layer.name, desc: '' };

      this.layerStates.push({
        radius: CORE_RADIUS + (n + 1) * spacing,
        speed: BASE_ORBIT_SPEED / (n + 1),
        particles,
        name: layer.name,
        displayName: meta.label,
        desc: meta.desc,
        count: layer.count,
        color: healthToColor(health),
        health,
      });
    }
  }

  /** Hit-test: returns layer index at canvas coordinates, or -1 */
  hitTestLayer(x: number, y: number): number {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    for (let n = 0; n < this.layerStates.length; n++) {
      const ls = this.layerStates[n];
      if (Math.abs(dist - ls.radius) < 14) {
        return n;
      }
    }
    return -1;
  }

  /** Get layer info for tooltip display */
  getLayerInfo(layerIndex: number): { name: string; count: number; health: number } | null {
    const ls = this.layerStates[layerIndex];
    if (!ls) return null;
    return { name: ls.name, count: ls.count, health: ls.health };
  }

  get layerCount(): number {
    return this.layerStates.length;
  }

  update(_dt: number, progress: number, time: number): void {
    // Once all layers have faded in, lock progress to 1.0 permanently.
    // Only the ring rotation (driven by time) continues animating.
    if (!this.introComplete && progress >= 0.95) {
      this.introComplete = true;
    }
    this.progress = this.introComplete ? 1.0 : progress;
    this.time = time;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = this.cx;
    const cy = this.cy;
    const progress = this.progress;
    const time = this.time;
    const maxLayers = this.layerStates.length;
    const hs = this.healthScore;

    // ── Label layout: split layers left/right ───────────
    // Even indices (0, 2, 4) → LEFT side
    // Odd indices (1, 3, 5) → RIGHT side
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];
    for (let n = 0; n < maxLayers; n++) {
      if (n % 2 === 0) leftIndices.push(n);
      else rightIndices.push(n);
    }

    // Vertical distribution — symmetric padding top/bottom for true centering
    const labelTop = 16;
    const labelBottom = height - 16;
    const leftRowH = leftIndices.length > 1
      ? Math.min(42, (labelBottom - labelTop) / leftIndices.length)
      : 42;
    const rightRowH = rightIndices.length > 1
      ? Math.min(42, (labelBottom - labelTop) / rightIndices.length)
      : 42;

    // Center each side's label block vertically
    const leftBlockH = leftIndices.length * leftRowH;
    const leftStartY = labelTop + (labelBottom - labelTop - leftBlockH) / 2 + leftRowH / 2;
    const rightBlockH = rightIndices.length * rightRowH;
    const rightStartY = labelTop + (labelBottom - labelTop - rightBlockH) / 2 + rightRowH / 2;

    // Horizontal positions for label columns
    const leftLabelX = width * 0.26;  // right-aligned labels on left side
    const rightLabelX = width * 0.74; // left-aligned labels on right side
    const barWidth = width * 0.18;

    // ── Layer phases ────────────────────────────────────
    const layerPhases: number[] = [];

    // ── Rings + particles ───────────────────────────────
    for (let n = 0; n < maxLayers; n++) {
      const ls = this.layerStates[n];
      const layerPhase = smoothstep(
        n / (maxLayers + 1),
        (n + 0.5) / (maxLayers + 1),
        progress,
      );
      layerPhases.push(layerPhase);
      if (layerPhase < 0.01) continue;

      renderRing(ctx, cx, cy, ls.radius, layerPhase * 0.08, ls.color);

      const rotation = ls.speed * time;
      const particleOpacity = layerPhase * (0.35 + 0.08 * n);
      const jitterAmp = (1 - ls.health) * 5;
      const jitterSpeed = 2 + (1 - ls.health) * 8;

      for (const p of ls.particles) {
        const angle = p.angleOffset + rotation;
        let px = cx + Math.cos(angle) * ls.radius;
        let py = cy + Math.sin(angle) * ls.radius;

        if (jitterAmp > 0.1) {
          px += Math.sin(time * jitterSpeed + p.jitterSeed) * jitterAmp;
          py += Math.cos(time * jitterSpeed * 1.3 + p.jitterSeed * 2) * jitterAmp;
        }

        const size = 1.5 * p.sizeVariance;
        const opacity = clamp(particleOpacity * p.opacityVariance, 0.05, 1.0);
        renderGlowDot(ctx, px, py, size, opacity, ls.color, size * 3);
      }
    }

    // ── LEFT labels (even layers: 0, 2, 4) ──────────────
    for (let i = 0; i < leftIndices.length; i++) {
      const n = leftIndices[i];
      const ls = this.layerStates[n];
      const layerPhase = layerPhases[n];
      if (layerPhase < 0.1) continue;

      const labelY = leftStartY + i * leftRowH;
      const fadeIn = layerPhase * 0.85;
      const healthPct = Math.round(ls.health * 100);

      // Connector: label → ring (left side of ring)
      const ringEdgeX = cx - ls.radius;
      renderLine(ctx, leftLabelX + 4, labelY, ringEdgeX, cy, fadeIn * 0.07, 0.5, ls.color);
      renderGlowDot(ctx, ringEdgeX, cy, 1.5, fadeIn * 0.5, ls.color, 3);

      // Name + health % (right-aligned)
      renderLabel(ctx, {
        text: `${healthPct}%  ${ls.displayName}`,
        x: leftLabelX,
        y: labelY - 5,
        opacity: fadeIn,
        size: 9,
        color: ls.color,
        align: 'right',
      });

      // Description (right-aligned)
      renderLabel(ctx, {
        text: `${ls.desc} (${ls.count})`,
        x: leftLabelX,
        y: labelY + 7,
        opacity: fadeIn * 0.4,
        size: 7,
        color: '#94a3b8',
        align: 'right',
      });

      // Health bar (right-aligned: grows leftward)
      this.drawHealthBarRight(ctx, leftLabelX, labelY + 15, barWidth, 2, ls.health, ls.color, fadeIn);
    }

    // ── RIGHT labels (odd layers: 1, 3, 5) ──────────────
    for (let i = 0; i < rightIndices.length; i++) {
      const n = rightIndices[i];
      const ls = this.layerStates[n];
      const layerPhase = layerPhases[n];
      if (layerPhase < 0.1) continue;

      const labelY = rightStartY + i * rightRowH;
      const fadeIn = layerPhase * 0.85;
      const healthPct = Math.round(ls.health * 100);

      // Connector: ring → label (right side of ring)
      const ringEdgeX = cx + ls.radius;
      renderLine(ctx, ringEdgeX, cy, rightLabelX - 4, labelY, fadeIn * 0.07, 0.5, ls.color);
      renderGlowDot(ctx, ringEdgeX, cy, 1.5, fadeIn * 0.5, ls.color, 3);

      // Name + health % (left-aligned)
      renderLabel(ctx, {
        text: `${ls.displayName}  ${healthPct}%`,
        x: rightLabelX,
        y: labelY - 5,
        opacity: fadeIn,
        size: 9,
        color: ls.color,
        align: 'left',
      });

      // Description (left-aligned)
      renderLabel(ctx, {
        text: `${ls.desc} (${ls.count})`,
        x: rightLabelX,
        y: labelY + 7,
        opacity: fadeIn * 0.4,
        size: 7,
        color: '#94a3b8',
        align: 'left',
      });

      // Health bar (left-aligned)
      this.drawHealthBar(ctx, rightLabelX, labelY + 15, barWidth, 2, ls.health, ls.color, fadeIn);
    }

    // ── Core glow ───────────────────────────────────────
    const pulseFreq = lerp(5, 1.2, hs);
    const pulseAmp = lerp(0.05, 0.2, hs);
    const coreGlow = 0.4 + pulseAmp * Math.sin(time * pulseFreq);
    const coreScale = 1 + pulseAmp * 0.5 * Math.sin(time * pulseFreq);

    renderGlowDot(ctx, cx, cy, CORE_RADIUS * 0.5 * coreScale, coreGlow, '#ffffff', CORE_RADIUS * 2 * coreScale);
    renderGlowDot(ctx, cx, cy, 4, 0.9, '#ffffff', 12);

    // ── Health % at center ──────────────────────────────
    renderLabel(ctx, {
      text: `${Math.round(hs * 100)}%`,
      x: cx,
      y: cy + CORE_RADIUS + 8,
      opacity: 0.9,
      size: 11,
      color: healthToColor(hs),
      align: 'center',
    });

  }

  /** Health bar growing left-to-right */
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    barWidth: number, barHeight: number,
    health: number, color: string, opacity: number,
  ): void {
    ctx.globalAlpha = opacity * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.globalAlpha = opacity * 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth * clamp(health, 0, 1), barHeight);
    ctx.globalAlpha = 1;
  }

  /** Health bar growing right-to-left (for left-side labels) */
  private drawHealthBarRight(
    ctx: CanvasRenderingContext2D,
    rightEdge: number, y: number,
    barWidth: number, barHeight: number,
    health: number, color: string, opacity: number,
  ): void {
    const x = rightEdge - barWidth;
    ctx.globalAlpha = opacity * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, barWidth, barHeight);
    const fillWidth = barWidth * clamp(health, 0, 1);
    ctx.globalAlpha = opacity * 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(rightEdge - fillWidth, y, fillWidth, barHeight);
    ctx.globalAlpha = 1;
  }

  dispose(): void {
    this.layerStates = [];
  }
}
