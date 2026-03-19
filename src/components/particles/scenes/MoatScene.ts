/**
 * MoatScene — slide 15/15
 * "chaque couche rend la forteresse plus infranchissable"
 *
 * Elements:
 *   - Central core (white, big glow)
 *   - Concentric layers added progressively
 *   - Each layer = ring of small particles with differential rotation
 *   - Counter: "N couche(s) de défense"
 *
 * Formulas:
 *   layer_r(n) = core_radius + n * layer_spacing
 *   particles_per_layer = 6 + n * 2
 *   ω_n = base_speed / (n + 1) — outer layers rotate slower
 *   layer appearance = smoothstep based on progress
 */

import { TAU } from '../engine/types';
import { renderGlowDot, renderRing } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { smoothstep, clamp } from './types';

// ── Data ──────────────────────────────────────────────────────

export interface MoatData {
  layers: Array<{
    name: string;
    count: number;
    color?: string;
  }>;
}

const DEFAULT_DATA: MoatData = {
  layers: [
    { name: 'code', count: 8 },
    { name: 'notes', count: 12 },
    { name: 'skills', count: 16 },
    { name: 'personas', count: 20 },
    { name: 'episodes', count: 24 },
  ],
};

// ── Constants ─────────────────────────────────────────────────

const CORE_RADIUS = 16;
const LAYER_SPACING = 28;
const BASE_ORBIT_SPEED = 0.8; // rad/s

// ── Pre-allocated particle ring positions ─────────────────────

interface LayerParticle {
  angleOffset: number; // fixed offset within ring
  sizeVariance: number;
  opacityVariance: number;
}

interface LayerState {
  radius: number;
  speed: number; // angular velocity
  particles: LayerParticle[];
  name: string;
  color: string;
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

  private layerStates: LayerState[] = [];

  setData(data: unknown): void {
    const d = data as MoatData;
    if (d && Array.isArray(d.layers)) {
      this.data = d;
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
      const particlesCount = 6 + n * 2;
      const particles: LayerParticle[] = [];

      for (let j = 0; j < particlesCount; j++) {
        particles.push({
          angleOffset: (TAU * j) / particlesCount,
          sizeVariance: 0.8 + Math.random() * 0.4,
          opacityVariance: 0.9 + Math.random() * 0.2,
        });
      }

      this.layerStates.push({
        radius: CORE_RADIUS + (n + 1) * LAYER_SPACING,
        speed: BASE_ORBIT_SPEED / (n + 1), // outer = slower
        particles,
        name: layer.name,
        color: layer.color ?? '#ffffff',
      });
    }
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

      // Faint guide ring
      renderRing(ctx, cx, cy, ls.radius, layerPhase * 0.06, 'rgba(255,255,255,1)');

      // Particle ring with rotation
      const rotation = ls.speed * time;
      const particleOpacity = layerPhase * (0.4 + 0.1 * n);

      for (const p of ls.particles) {
        const angle = p.angleOffset + rotation;
        const px = cx + Math.cos(angle) * ls.radius;
        const py = cy + Math.sin(angle) * ls.radius;
        const size = 1.5 * p.sizeVariance;
        const opacity = clamp(particleOpacity * p.opacityVariance, 0.05, 1.0);

        // Draw particle with subtle glow
        renderGlowDot(ctx, px, py, size, opacity, '#ffffff', size * 3);
      }

      // Layer name label (to the right of the ring)
      if (layerPhase > 0.3) {
        renderLabel(ctx, {
          text: ls.name,
          x: cx + ls.radius + 16,
          y: cy,
          opacity: layerPhase * 0.5,
          size: 9,
          color: '#ffffff',
          align: 'left',
        });
      }
    }

    // ── Core glow (pulsating) ─────────────────────────
    const coreGlowIntensity = 0.4 + 0.1 * Math.sin(time * 2);
    renderGlowDot(
      ctx,
      cx,
      cy,
      CORE_RADIUS * 0.5,
      coreGlowIntensity,
      '#ffffff',
      CORE_RADIUS * 2,
    );

    // Brighter inner core
    renderGlowDot(ctx, cx, cy, 4, 0.9, '#ffffff', 12);

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
