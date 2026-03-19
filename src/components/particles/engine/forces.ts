/**
 * Forces — All 6 force implementations.
 *
 * Each force implements the Force interface: apply(p, dt, time)
 * Forces modify p.ax/p.ay (acceleration), NOT velocity directly.
 */

import type { Force, Particle, Vec2 } from './types';
import { MIN_DIST_SQ, TAU } from './types';

// ── Attractor ──────────────────────────────────────────────

export interface AttractorConfig {
  target: Vec2;
  strength: number;
  minDist?: number; // floor to avoid singularity
}

export class AttractorForce implements Force {
  target: Vec2;
  strength: number;
  private minDistSq: number;

  constructor(config: AttractorConfig) {
    this.target = config.target;
    this.strength = config.strength;
    const minDist = config.minDist ?? 1;
    this.minDistSq = minDist * minDist;
  }

  apply(p: Particle): void {
    const dx = this.target.x - p.x;
    const dy = this.target.y - p.y;
    const distSq = Math.max(dx * dx + dy * dy, MIN_DIST_SQ);
    const dist = Math.sqrt(distSq);
    const f = this.strength / Math.max(distSq, this.minDistSq);
    p.ax += (f * dx) / dist;
    p.ay += (f * dy) / dist;
  }
}

// ── Spring (Hooke) ─────────────────────────────────────────

export interface SpringConfig {
  anchor: Vec2;
  stiffness: number;
  restLength?: number;
}

export class SpringForce implements Force {
  anchor: Vec2;
  stiffness: number;
  restLength: number;

  constructor(config: SpringConfig) {
    this.anchor = config.anchor;
    this.stiffness = config.stiffness;
    this.restLength = config.restLength ?? 0;
  }

  apply(p: Particle): void {
    const dx = this.anchor.x - p.x;
    const dy = this.anchor.y - p.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < MIN_DIST_SQ) return; // at anchor, no force
    const dist = Math.sqrt(distSq);
    const displacement = dist - this.restLength;
    const f = this.stiffness * displacement;
    p.ax += (f * dx) / dist;
    p.ay += (f * dy) / dist;
  }
}

// ── Orbit ──────────────────────────────────────────────────

export interface OrbitConfig {
  center: Vec2;
  speed: number;
  tangentialStrength?: number;
}

export class OrbitForce implements Force {
  center: Vec2;
  speed: number;
  tangentialStrength: number;

  constructor(config: OrbitConfig) {
    this.center = config.center;
    this.speed = config.speed;
    this.tangentialStrength = config.tangentialStrength ?? 1;
  }

  apply(p: Particle): void {
    const dx = this.center.x - p.x;
    const dy = this.center.y - p.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < MIN_DIST_SQ) return;
    const dist = Math.sqrt(distSq);

    // Centripetal — keeps in orbit
    const fc = (this.speed * this.speed) / dist;
    p.ax += (fc * dx) / dist;
    p.ay += (fc * dy) / dist;

    // Tangential — drives rotation
    const tx = -dy / dist;
    const ty = dx / dist;
    p.ax += this.speed * tx * this.tangentialStrength;
    p.ay += this.speed * ty * this.tangentialStrength;
  }
}

// ── Drag (linear) ──────────────────────────────────────────
// Linear drag: a = -coefficient * v
// This is additive and controllable per-scene.
// The global damping (v *= damping) in the simulation loop is separate.

export interface DragConfig {
  coefficient: number;
}

export class DragForce implements Force {
  coefficient: number;

  constructor(config: DragConfig) {
    this.coefficient = config.coefficient;
  }

  apply(p: Particle): void {
    p.ax += -this.coefficient * p.vx;
    p.ay += -this.coefficient * p.vy;
  }
}

// ── Noise (hash-based value noise, no dependency) ──────────

export interface NoiseConfig {
  frequency?: number;
  amplitude?: number;
  speed?: number;
}

// Simple hash-based 2D noise — no external dependency
function hash2d(ix: number, iy: number): number {
  // Fast integer hash (Robert Jenkins' 96-bit mix variant)
  let h = (ix * 374761393 + iy * 668265263 + 1013904223) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff; // 0..1
}

function smoothNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2d(ix, iy);
  const n10 = hash2d(ix + 1, iy);
  const n01 = hash2d(ix, iy + 1);
  const n11 = hash2d(ix + 1, iy + 1);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sy * (nx1 - nx0); // 0..1
}

export class NoiseForce implements Force {
  frequency: number;
  amplitude: number;
  speed: number;

  constructor(config: NoiseConfig = {}) {
    this.frequency = config.frequency ?? 0.01;
    this.amplitude = config.amplitude ?? 50;
    this.speed = config.speed ?? 0.5;
  }

  apply(p: Particle, _dt: number, time: number): void {
    const n = smoothNoise2D(
      p.x * this.frequency,
      p.y * this.frequency + time * this.speed,
    );
    const angle = n * TAU;
    p.ax += Math.cos(angle) * this.amplitude;
    p.ay += Math.sin(angle) * this.amplitude;
  }
}

// ── Boundary (containment) ─────────────────────────────────

export interface BoundaryConfig {
  left: number;
  right: number;
  top: number;
  bottom: number;
  bounce?: number; // velocity retention on bounce (0..1)
}

export class BoundaryForce implements Force {
  left: number;
  right: number;
  top: number;
  bottom: number;
  bounce: number;

  constructor(config: BoundaryConfig) {
    this.left = config.left;
    this.right = config.right;
    this.top = config.top;
    this.bottom = config.bottom;
    this.bounce = config.bounce ?? 0.5;
  }

  apply(p: Particle): void {
    if (p.x < this.left) {
      p.x = this.left;
      p.vx = Math.abs(p.vx) * this.bounce;
    } else if (p.x > this.right) {
      p.x = this.right;
      p.vx = -Math.abs(p.vx) * this.bounce;
    }

    if (p.y < this.top) {
      p.y = this.top;
      p.vy = Math.abs(p.vy) * this.bounce;
    } else if (p.y > this.bottom) {
      p.y = this.bottom;
      p.vy = -Math.abs(p.vy) * this.bounce;
    }
  }
}
