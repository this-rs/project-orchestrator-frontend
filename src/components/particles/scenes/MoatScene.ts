/**
 * MoatScene — slide 15/15
 * "chaque couche rend la forteresse plus infranchissable"
 *
 * Elements:
 *   - Central core (white, big glow) — pulse proportional to healthScore
 *   - Concentric layers added progressively
 *   - Each layer = ring of small particles with differential rotation
 *   - Health-based coloring: healthy = white fluid, weak = reddish erratic
 *   - Center: health score percentage text
 *   - Counter: "N couche(s) de défense"
 *
 * Formulas:
 *   layer_r(n) = core_radius + n * layer_spacing
 *   particles_per_layer = 6 + n * 2
 *   ω_n = base_speed / (n + 1) — outer layers rotate slower
 *   layer appearance = smoothstep based on progress
 *   health → color interpolation: white(1.0) → orange(0.5) → red(0.0)
 *   health → movement: fluid(1.0) → erratic jitter(0.0)
 */

import { TAU } from '../engine/types';
import { renderGlowDot, renderRing } from '../renderer/CanvasRenderer';
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
    { name: 'notes', count: 12, health: 0.6 },
    { name: 'skills', count: 16, health: 0.9 },
    { name: 'personas', count: 20, health: 0.4 },
    { name: 'episodes', count: 24, health: 0.7 },
  ],
  healthScore: 0.68,
};

// ── Constants ─────────────────────────────────────────────────

const CORE_RADIUS = 16;
const LAYER_SPACING = 28;
const BASE_ORBIT_SPEED = 0.8; // rad/s

// ── Health → Color helpers ────────────────────────────────────

/** Interpolate from red (#f87171) through orange (#fb923c) to white (#ffffff) based on health 0-1 */
function healthToColor(health: number): string {
  const h = clamp(health, 0, 1);
  if (h >= 0.7) {
    // White zone: lerp from slight warm to pure white
    const t = (h - 0.7) / 0.3;
    const r = Math.round(lerp(255, 255, t));
    const g = Math.round(lerp(230, 255, t));
    const b = Math.round(lerp(210, 255, t));
    return `rgb(${r},${g},${b})`;
  } else if (h >= 0.4) {
    // Orange zone
    const t = (h - 0.4) / 0.3;
    const r = Math.round(lerp(251, 255, t));
    const g = Math.round(lerp(146, 230, t));
    const b = Math.round(lerp(60, 210, t));
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
  angleOffset: number; // fixed offset within ring
  sizeVariance: number;
  opacityVariance: number;
  /** Random seed for erratic jitter (unique per particle) */
  jitterSeed: number;
}

interface LayerState {
  radius: number;
  speed: number; // angular velocity
  particles: LayerParticle[];
  name: string;
  count: number;
  color: string;
  health: number;
}

// ── Scene ─────────────────────────────────────────────────────

export class MoatScene implements ParticleScene {
  readonly name = 'moat';
  readonly title = 'MOAT';
  readonly description =
    'chaque couche rend la forteresse plus infranchissable';

  private data: MoatData = DEFAULT_DATA;
  private cx = 0;
  private cy = 0;
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
    this.cx = width * 0.5;
    this.cy = height * 0.48;
    this.buildLayers();
  }

  resize(width: number, height: number): void {
    this.cx = width * 0.5;
    this.cy = height * 0.48;
  }

  private buildLayers(): void {
    const { layers } = this.data;
    this.layerStates = [];

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
        radius: CORE_RADIUS + (n + 1) * LAYER_SPACING,
        speed: BASE_ORBIT_SPEED / (n + 1), // outer = slower
        particles,
        name: layer.name,
        count: layer.count,
        color: healthToColor(health),
        health,
      });
    }
  }

  /** Hit-test helper: returns the layer index at the given canvas coordinates, or -1 */
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
    const currentLayers = Math.floor(progress * (maxLayers + 1));
    const hs = this.healthScore;

    // ── Title ───────────────────────────────────────────
    renderTitle(ctx, this.title, width, 0.5);

    // ── Layer rings + particles ────────────────────────
    for (let n = 0; n < maxLayers; n++) {
      const ls = this.layerStates[n];

      // Layer appearance animation
      const layerPhase = smoothstep(
        n / maxLayers - 0.05,
        n / maxLayers + 0.05,
        progress,
      );
      if (layerPhase < 0.01) continue;

      // Ring color tinted by health
      const ringAlpha = layerPhase * 0.06;
      renderRing(ctx, cx, cy, ls.radius, ringAlpha, ls.color);

      // Particle ring with rotation
      const rotation = ls.speed * time;
      const particleOpacity = layerPhase * (0.4 + 0.1 * n);

      // Erratic jitter amplitude: unhealthy = more jitter
      const jitterAmp = (1 - ls.health) * 6;
      // Unhealthy layers have faster erratic movement
      const jitterSpeed = 2 + (1 - ls.health) * 8;

      for (const p of ls.particles) {
        const angle = p.angleOffset + rotation;
        let px = cx + Math.cos(angle) * ls.radius;
        let py = cy + Math.sin(angle) * ls.radius;

        // Add jitter for unhealthy layers
        if (jitterAmp > 0.1) {
          px += Math.sin(time * jitterSpeed + p.jitterSeed) * jitterAmp;
          py += Math.cos(time * jitterSpeed * 1.3 + p.jitterSeed * 2) * jitterAmp;
        }

        const size = 1.5 * p.sizeVariance;
        const opacity = clamp(particleOpacity * p.opacityVariance, 0.05, 1.0);

        // Draw particle with health-tinted glow
        renderGlowDot(ctx, px, py, size, opacity, ls.color, size * 3);
      }

      // Layer name label (to the right of the ring)
      if (layerPhase > 0.3) {
        renderLabel(ctx, {
          text: ls.name,
          x: cx + ls.radius + 16,
          y: cy,
          opacity: layerPhase * 0.5,
          size: 9,
          color: ls.color,
          align: 'left',
        });
      }
    }

    // ── Core glow (pulsating proportional to health) ───
    // High health = slow + large pulse; Low health = fast + small pulse
    const pulseFreq = lerp(5, 1.2, hs); // fast (5 Hz) when sick, slow (1.2 Hz) when healthy
    const pulseAmplitude = lerp(0.05, 0.2, hs); // small when sick, large when healthy
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
    renderLabel(ctx, {
      text: pctText,
      x: cx,
      y: cy + CORE_RADIUS + 8,
      opacity: 0.8,
      size: 10,
      color: '#22d3ee',
      align: 'center',
    });

    // ── Counter ───────────────────────────────────────
    const displayLayers = clamp(currentLayers, 0, maxLayers);
    const counterText =
      displayLayers === 0
        ? '0 couche de défense'
        : `${displayLayers} couche${displayLayers > 1 ? 's' : ''} de défense`;

    renderLabel(ctx, {
      text: counterText,
      x: width / 2,
      y: height - 30,
      opacity: 0.7,
      size: 11,
      color: '#22d3ee',
      align: 'center',
    });
  }

  dispose(): void {
    this.layerStates = [];
  }
}
