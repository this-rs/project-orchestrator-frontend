/**
 * Particle Emitters — 4 emission patterns.
 *
 * All emitters share the Emitter interface: emit(pool, config) → void.
 * Each spawns particles via pool.spawn() with computed positions & velocities.
 */

import type { ParticlePool } from './ParticlePool';
import type { EmitterConfig, SpawnConfig, Vec2 } from './types';
import { TAU } from './types';

// ── Helpers (zero-alloc) ────────────────────────────────────

/** Random float in [min, max) */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Spawn a single particle at (x, y) with velocity (vx, vy), merging base config */
function spawnOne(
  pool: ParticlePool,
  x: number,
  y: number,
  vx: number,
  vy: number,
  base: SpawnConfig,
): void {
  pool.spawn({ ...base, x, y, vx, vy });
}

// ── PointEmitter ────────────────────────────────────────────

/**
 * Spawns particles at a single point with velocity in a cone.
 * `angle` = center direction, `spread` = half-cone width.
 */
export const PointEmitter = {
  emit(pool: ParticlePool, cfg: EmitterConfig): void {
    const { position, angle, spread, speed, config } = cfg;
    const a = angle + rand(-spread, spread);
    spawnOne(pool, position.x, position.y, Math.cos(a) * speed, Math.sin(a) * speed, config);
  },
};

// ── RingEmitter ─────────────────────────────────────────────

export interface RingEmitterOptions {
  /** Ring radius in px */
  radius: number;
  /** Number of particles per emit call */
  count: number;
  /** If true, distribute uniformly; otherwise random angles */
  uniform?: boolean;
  /** Velocity mode: 'radial' outward or 'tangential' */
  velocityMode?: 'radial' | 'tangential';
}

/**
 * Spawns particles on a circle perimeter.
 * Velocity is radial (outward) or tangential.
 */
export const RingEmitter = {
  emit(
    pool: ParticlePool,
    cfg: EmitterConfig,
    opts: RingEmitterOptions = { radius: 50, count: 1 },
  ): void {
    const { position, speed, config } = cfg;
    const { radius, count, uniform = false, velocityMode = 'radial' } = opts;

    for (let i = 0; i < count; i++) {
      const theta = uniform ? (TAU * i) / count : Math.random() * TAU;
      const cx = position.x + radius * Math.cos(theta);
      const cy = position.y + radius * Math.sin(theta);

      let vx: number, vy: number;
      if (velocityMode === 'tangential') {
        // perpendicular to radius: rotate 90°
        vx = -Math.sin(theta) * speed;
        vy = Math.cos(theta) * speed;
      } else {
        // radial outward
        vx = Math.cos(theta) * speed;
        vy = Math.sin(theta) * speed;
      }

      spawnOne(pool, cx, cy, vx, vy, config);
    }
  },
};

// ── LineEmitter ─────────────────────────────────────────────

export interface LineEmitterOptions {
  /** Line start */
  start: Vec2;
  /** Line end */
  end: Vec2;
}

/**
 * Spawns a particle at a random point along a line segment.
 * Velocity is perpendicular to the line ± spread.
 */
export const LineEmitter = {
  emit(pool: ParticlePool, cfg: EmitterConfig, opts: LineEmitterOptions): void {
    const { spread, speed, config } = cfg;
    const { start, end } = opts;

    const t = Math.random();
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;

    // perpendicular direction to line
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // normal = (-dy, dx) — perpendicular to line segment
    const perpAngle = Math.atan2(-dx, dy) + rand(-spread, spread);

    spawnOne(pool, x, y, Math.cos(perpAngle) * speed, Math.sin(perpAngle) * speed, config);
  },
};

// ── BurstEmitter ────────────────────────────────────────────

export interface BurstEmitterOptions {
  /** Number of particles to emit in one burst */
  count: number;
  /** Random angular jitter in radians (default 0) */
  jitter?: number;
}

/**
 * Emits `count` particles in a single burst, uniformly distributed in angle.
 * Optional jitter randomizes each particle's angle slightly.
 */
export const BurstEmitter = {
  emit(
    pool: ParticlePool,
    cfg: EmitterConfig,
    opts: BurstEmitterOptions = { count: 50 },
  ): void {
    const { position, speed, config } = cfg;
    const { count, jitter = 0 } = opts;

    for (let i = 0; i < count; i++) {
      const theta = (TAU * i) / count + rand(-jitter, jitter);
      spawnOne(
        pool,
        position.x,
        position.y,
        Math.cos(theta) * speed,
        Math.sin(theta) * speed,
        config,
      );
    }
  },
};
