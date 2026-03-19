/**
 * Emitter tests — verify spawn behavior for all 4 emitters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ParticlePool } from '../ParticlePool';
import { PointEmitter, RingEmitter, LineEmitter, BurstEmitter } from '../emitters';
import type { EmitterConfig } from '../types';
import { TAU } from '../types';

function makeConfig(overrides: Partial<EmitterConfig> = {}): EmitterConfig {
  return {
    position: { x: 100, y: 100 },
    rate: 10,
    spread: 0.5,
    angle: 0,
    speed: 50,
    config: { maxLife: 2, size: 2, color: '#ffffff' },
    ...overrides,
  };
}

describe('PointEmitter', () => {
  let pool: ParticlePool;

  beforeEach(() => {
    pool = new ParticlePool(128);
  });

  it('spawns exactly 1 particle per emit call', () => {
    PointEmitter.emit(pool, makeConfig());
    expect(pool.activeCount).toBe(1);
  });

  it('spawns at the configured position', () => {
    const cfg = makeConfig({ position: { x: 42, y: 77 } });
    PointEmitter.emit(pool, cfg);
    const p = pool.particles.find((p) => p.active)!;
    expect(p.x).toBe(42);
    expect(p.y).toBe(77);
  });

  it('velocity direction is within cone spread', () => {
    const cfg = makeConfig({ angle: 0, spread: 0, speed: 100 });
    PointEmitter.emit(pool, cfg);
    const p = pool.particles.find((p) => p.active)!;
    // With 0 spread, velocity should be exactly along angle 0
    expect(p.vx).toBeCloseTo(100, 5);
    expect(p.vy).toBeCloseTo(0, 5);
  });
});

describe('RingEmitter', () => {
  let pool: ParticlePool;

  beforeEach(() => {
    pool = new ParticlePool(256);
  });

  it('spawns `count` particles', () => {
    RingEmitter.emit(pool, makeConfig(), { radius: 30, count: 20 });
    expect(pool.activeCount).toBe(20);
  });

  it('uniform distribution places particles evenly on ring', () => {
    const center = { x: 200, y: 200 };
    const radius = 50;
    const count = 8;
    RingEmitter.emit(pool, makeConfig({ position: center, speed: 0 }), {
      radius,
      count,
      uniform: true,
    });

    const positions: { x: number; y: number }[] = [];
    pool.forEachActive((p) => positions.push({ x: p.x, y: p.y }));
    expect(positions.length).toBe(count);

    // Each particle should be at distance `radius` from center
    for (const pos of positions) {
      const dist = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
      expect(dist).toBeCloseTo(radius, 3);
    }
  });

  it('tangential velocity is perpendicular to radius', () => {
    const center = { x: 0, y: 0 };
    RingEmitter.emit(pool, makeConfig({ position: center, speed: 100 }), {
      radius: 50,
      count: 4,
      uniform: true,
      velocityMode: 'tangential',
    });

    pool.forEachActive((p) => {
      // Dot product of position vector and velocity should be ~0
      const dot = (p.x - center.x) * p.vx + (p.y - center.y) * p.vy;
      expect(dot).toBeCloseTo(0, 3);
    });
  });
});

describe('LineEmitter', () => {
  let pool: ParticlePool;

  beforeEach(() => {
    pool = new ParticlePool(128);
  });

  it('spawns particle on the line segment', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    // Run many times to check statistical property
    for (let i = 0; i < 50; i++) {
      pool.reset();
      LineEmitter.emit(pool, makeConfig({ speed: 0 }), { start, end });
      const p = pool.particles.find((p) => p.active)!;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeCloseTo(0, 10);
    }
  });

  it('velocity is perpendicular to line when spread=0', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 }; // horizontal line
    const cfg = makeConfig({ spread: 0, speed: 50 });
    LineEmitter.emit(pool, cfg, { start, end });
    const p = pool.particles.find((p) => p.active)!;
    // Perpendicular to horizontal line = purely vertical
    expect(Math.abs(p.vx)).toBeCloseTo(0, 3);
    expect(Math.abs(p.vy)).toBeCloseTo(50, 3);
  });
});

describe('BurstEmitter', () => {
  let pool: ParticlePool;

  beforeEach(() => {
    pool = new ParticlePool(256);
  });

  it('emits exactly `count` particles (50)', () => {
    BurstEmitter.emit(pool, makeConfig(), { count: 50 });
    expect(pool.activeCount).toBe(50);
  });

  it('particles are uniformly distributed in angle', () => {
    const count = 50;
    BurstEmitter.emit(pool, makeConfig({ position: { x: 0, y: 0 }, speed: 100 }), {
      count,
      jitter: 0,
    });

    const angles: number[] = [];
    pool.forEachActive((p) => {
      angles.push(Math.atan2(p.vy, p.vx));
    });

    expect(angles.length).toBe(count);

    // Sort angles and check spacing is uniform (TAU/count ≈ 0.1257)
    angles.sort((a, b) => a - b);
    const expectedSpacing = TAU / count;
    for (let i = 1; i < angles.length; i++) {
      const gap = angles[i] - angles[i - 1];
      expect(gap).toBeCloseTo(expectedSpacing, 2);
    }
  });

  it('respects pool capacity limit', () => {
    const smallPool = new ParticlePool(10);
    BurstEmitter.emit(smallPool, makeConfig(), { count: 50 });
    expect(smallPool.activeCount).toBe(10); // capped at capacity
  });
});
