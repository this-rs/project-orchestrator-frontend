/**
 * MoatScene — Project Health visualization.
 *
 * Concentric rings represent knowledge graph layers.
 * Each ring's color/behavior reflects its health score.
 *
 * Layout:
 *   - Central core (white glow) — pulse proportional to global healthScore
 *   - Concentric layer rings added progressively
 *   - Each layer = ring of small particles with differential rotation
 *   - Health-based coloring: healthy = cyan/white, weak = orange/red + jitter
 *   - Layer labels on the RIGHT with name, count, health bar
 *   - Center: global health score percentage
 *   - Bottom: summary counter
 *
 * Visual encoding:
 *   layer_r(n) = core_radius + n * layer_spacing
 *   particles_per_layer = 6 + n * 2
 *   omega_n = base_speed / (n + 1) — outer layers rotate slower
 *   health -> color: cyan(1.0) -> orange(0.5) -> red(0.0)
 *   health -> movement: fluid(1.0) -> erratic jitter(0.0)
 */

import { TAU } from '../engine/types';
import { renderGlowDot, renderRing, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
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

// ── Human-readable layer names ────────────────────────────────

const LAYER_DISPLAY_NAMES: Record<string, string> = {
  code: 'Code',
  knowledge: 'Knowledge',
  skills: 'Skills',
  behavioral: 'Behavioral',
  fabric: 'Fabric',
  neural: 'Neural',
  notes: 'Notes',
  personas: 'Personas',
  episodes: 'Episodes',
};

// ── Constants ─────────────────────────────────────────────────

const CORE_RADIUS = 16;
const LAYER_SPACING = 24;
const BASE_ORBIT_SPEED = 0.8; // rad/s

// ── Health → Color helpers ────────────────────────────────────

/** Health color: cyan (#22d3ee) at 1.0 → orange (#fb923c) at 0.5 → red (#f87171) at 0.0 */
function healthToColor(health: number): string {
  const h = clamp(health, 0, 1);
  if (h >= 0.7) {
    // Cyan zone: lerp from warm cyan to bright cyan
    const t = (h - 0.7) / 0.3;
    const r = Math.round(lerp(100, 34, t));
    const g = Math.round(lerp(200, 211, t));
    const b = Math.round(lerp(220, 238, t));
    return `rgb(${r},${g},${b})`;
  } else if (h >= 0.4) {
    // Orange zone
    const t = (h - 0.4) / 0.3;
    const r = Math.round(lerp(251, 100, t));
    const g = Math.round(lerp(146, 200, t));
    const b = Math.round(lerp(60, 220, t));
    return `rgb(${r},${g},${b})`;
  } else {
    // Red zone
    const t = h / 0.4;
    const r = Math.round(lerp(248, 251, t));
    const g = Math.round(lerp(113, 146, t));
    const b = Math.round(lerp(113, 60, t));
    return `rgb(${r},${g},${b})`;
  }
}

// ── Pre-allocated particle ring positions ─────────────────────

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
  count: number;
  color: string;
  health: number;
}

// ── Scene ─────────────────────────────────────────────────────

export class MoatScene implements ParticleScene {
  readonly name = 'moat';
  readonly title = 'PROJECT HEALTH';
  readonly description =
    'Knowledge graph layers — health & coverage';

  private data: MoatData = DEFAULT_DATA;
  private cx = 0;
  private cy = 0;
  private w = 0;
  private h = 0;
  private progress = 0;
  private time = 0;
  private healthScore = 0.68;

  private layerStates: LayerState[] = [];

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
    // Center the rings slightly left to leave room for labels on the right
    this.cx = width * 0.38;
    this.cy = height * 0.48;
    this.buildLayers();
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.cx = width * 0.38;
    this.cy = height * 0.48;
  }

  private buildLayers(): void {
    const { layers } = this.data;
    this.layerStates = [];

    // Adaptive spacing: if many layers, reduce spacing to fit
    const maxRadius = Math.min(this.w * 0.32, this.h * 0.38);
    const spacing = layers.length > 0
      ? Math.min(LAYER_SPACING, (maxRadius - CORE_RADIUS) / layers.length)
      : LAYER_SPACING;

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

      this.layerStates.push({
        radius: CORE_RADIUS + (n + 1) * spacing,
        speed: BASE_ORBIT_SPEED / (n + 1),
        particles,
        name: layer.name,
        displayName: LAYER_DISPLAY_NAMES[layer.name] || layer.name,
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
    this.progress = progress;
    this.time = time;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = this.cx;
    const cy = this.cy;
    const progress = this.progress;
    const time = this.time;
    const maxLayers = this.layerStates.length;
    const hs = this.healthScore;

    // ── Layout: label column on the right ────────────────
    // Labels are placed in a fixed column, evenly distributed vertically
    const labelColumnX = width * 0.62; // fixed X for all labels
    const labelTopY = 50;              // start below title
    const labelBottomY = height - 40;  // end above counter
    const labelRowHeight = maxLayers > 1
      ? Math.min(30, (labelBottomY - labelTopY) / maxLayers)
      : 30;
    // Center the label block vertically
    const labelBlockHeight = maxLayers * labelRowHeight;
    const labelStartY = labelTopY + (labelBottomY - labelTopY - labelBlockHeight) / 2 + labelRowHeight / 2;

    // ── Title ───────────────────────────────────────────
    renderTitle(ctx, this.title, width, 0.5);

    // ── Collect layer phases for label drawing ──────────
    const layerPhases: number[] = [];

    // ── Layer rings + particles ─────────────────────────
    for (let n = 0; n < maxLayers; n++) {
      const ls = this.layerStates[n];

      // Layer appearance animation
      const layerPhase = smoothstep(
        n / (maxLayers + 1),
        (n + 0.5) / (maxLayers + 1),
        progress,
      );
      layerPhases.push(layerPhase);
      if (layerPhase < 0.01) continue;

      // Ring
      const ringAlpha = layerPhase * 0.08;
      renderRing(ctx, cx, cy, ls.radius, ringAlpha, ls.color);

      // Particle ring with rotation
      const rotation = ls.speed * time;
      const particleOpacity = layerPhase * (0.35 + 0.08 * n);

      // Erratic jitter for unhealthy layers
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

    // ── Layer labels (fixed column, evenly spaced) ──────
    for (let n = 0; n < maxLayers; n++) {
      const ls = this.layerStates[n];
      const layerPhase = layerPhases[n];
      if (layerPhase < 0.15) continue;

      const labelY = labelStartY + n * labelRowHeight;
      const labelOpacity = layerPhase * 0.8;
      const healthPct = Math.round(ls.health * 100);

      // Connector line: from ring edge to label
      const ringEdgeX = cx + ls.radius;
      const ringEdgeY = cy; // connect from the right side of the ring
      renderLine(
        ctx,
        ringEdgeX, ringEdgeY,
        labelColumnX - 8, labelY,
        layerPhase * 0.06,
        0.5,
        ls.color,
      );

      // Small dot at the ring connection point
      renderGlowDot(ctx, ringEdgeX, ringEdgeY, 1.5, layerPhase * 0.4, ls.color, 3);

      // Layer name + health %
      renderLabel(ctx, {
        text: `${ls.displayName}  ${healthPct}%`,
        x: labelColumnX,
        y: labelY - 4,
        opacity: labelOpacity,
        size: 9,
        color: ls.color,
        align: 'left',
      });

      // Health bar underneath the name
      this.drawHealthBar(
        ctx,
        labelColumnX, labelY + 6,
        50, 2,
        ls.health, ls.color, labelOpacity,
      );

      // Count underneath the bar
      renderLabel(ctx, {
        text: `${ls.count} entities`,
        x: labelColumnX,
        y: labelY + 16,
        opacity: labelOpacity * 0.45,
        size: 7,
        color: '#94a3b8',
        align: 'left',
      });
    }

    // ── Core glow (pulsating proportional to health) ───
    const pulseFreq = lerp(5, 1.2, hs);
    const pulseAmplitude = lerp(0.05, 0.2, hs);
    const coreGlowIntensity = 0.4 + pulseAmplitude * Math.sin(time * pulseFreq);
    const coreScale = 1 + pulseAmplitude * 0.5 * Math.sin(time * pulseFreq);

    renderGlowDot(
      ctx,
      cx,
      cy,
      CORE_RADIUS * 0.5 * coreScale,
      coreGlowIntensity,
      '#ffffff',
      CORE_RADIUS * 2 * coreScale,
    );

    // Brighter inner core
    renderGlowDot(ctx, cx, cy, 4, 0.9, '#ffffff', 12);

    // ── Health percentage at center ─────────────────────
    const pctText = `${Math.round(hs * 100)}%`;
    const healthColor = healthToColor(hs);
    renderLabel(ctx, {
      text: pctText,
      x: cx,
      y: cy + CORE_RADIUS + 10,
      opacity: 0.9,
      size: 12,
      color: healthColor,
      align: 'center',
    });

    // Small "HEALTH" label under the percentage
    renderLabel(ctx, {
      text: 'health',
      x: cx,
      y: cy + CORE_RADIUS + 22,
      opacity: 0.4,
      size: 8,
      color: '#94a3b8',
      align: 'center',
    });

    // ── Summary counter at bottom ───────────────────────
    const displayLayers = clamp(
      Math.floor(progress * (maxLayers + 1)),
      0,
      maxLayers,
    );

    if (displayLayers > 0) {
      const counterOpacity = smoothstep(0.1, 0.3, progress) * 0.6;
      const warningCount = this.layerStates.filter(l => l.health < 0.5).length;

      let counterText = `${displayLayers} layer${displayLayers > 1 ? 's' : ''} active`;
      if (warningCount > 0 && progress > 0.5) {
        counterText += ` \u00B7 ${warningCount} need${warningCount > 1 ? '' : 's'} attention`;
      }

      renderLabel(ctx, {
        text: counterText,
        x: width / 2,
        y: height - 24,
        opacity: counterOpacity,
        size: 10,
        color: warningCount > 0 ? '#fb923c' : '#22d3ee',
        align: 'center',
      });
    }
  }

  /** Draw a mini health bar */
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    health: number,
    color: string,
    opacity: number,
  ): void {
    // Background track
    ctx.globalAlpha = opacity * 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);

    // Filled portion
    const fillWidth = width * clamp(health, 0, 1);
    ctx.globalAlpha = opacity * 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fillWidth, height);

    ctx.globalAlpha = 1;
  }

  dispose(): void {
    this.layerStates = [];
  }
}
