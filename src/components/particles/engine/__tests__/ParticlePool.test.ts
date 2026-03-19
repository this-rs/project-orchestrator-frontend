/**
 * ParticlePool tests — verify object pool lifecycle and zero-alloc guarantees.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ParticlePool } from '../ParticlePool';

describe('ParticlePool', () => {
  let pool: ParticlePool;

  beforeEach(() => {
    pool = new ParticlePool(64);
  });

  it('starts with zero active particles', () => {
    expect(pool.activeCount).toBe(0);
  });

  it('spawns a particle with correct defaults', () => {
    const p = pool.spawn();
    expect(p).not.toBeNull();
    expect(p!.active).toBe(true);
    expect(p!.life).toBe(1);
    expect(p!.ax).toBe(0);
    expect(p!.ay).toBe(0);
    expect(pool.activeCount).toBe(1);
  });

  it('spawns with custom config', () => {
    const p = pool.spawn({
      x: 10,
      y: 20,
      vx: 1,
      vy: -1,
      maxLife: 5,
      size: 4,
      opacity: 0.5,
      color: '#ff0000',
      mass: 2,
      group: 3,
    });
    expect(p).not.toBeNull();
    expect(p!.x).toBe(10);
    expect(p!.y).toBe(20);
    expect(p!.vx).toBe(1);
    expect(p!.vy).toBe(-1);
    expect(p!.maxLife).toBe(5);
    expect(p!.size).toBe(4);
    expect(p!.opacity).toBe(0.5);
    expect(p!.color).toBe('#ff0000');
    expect(p!.mass).toBe(2);
    expect(p!.group).toBe(3);
  });

  it('returns null when pool is full', () => {
    const small = new ParticlePool(2);
    expect(small.spawn()).not.toBeNull();
    expect(small.spawn()).not.toBeNull();
    expect(small.spawn()).toBeNull();
    expect(small.activeCount).toBe(2);
  });

  it('recycles particles back to pool', () => {
    const p = pool.spawn()!;
    pool.recycle(p);
    expect(p.active).toBe(false);
    expect(pool.activeCount).toBe(0);
  });

  it('recycled slot can be re-spawned', () => {
    const small = new ParticlePool(1);
    const p1 = small.spawn()!;
    small.recycle(p1);
    const p2 = small.spawn();
    expect(p2).not.toBeNull();
    expect(small.activeCount).toBe(1);
  });

  it('spawn 500, recycle 200, re-spawn 200 → count = 500', () => {
    pool = new ParticlePool(1024);

    // Spawn 500
    const spawned: ReturnType<typeof pool.spawn>[] = [];
    for (let i = 0; i < 500; i++) {
      spawned.push(pool.spawn({ x: i, y: i }));
    }
    expect(pool.activeCount).toBe(500);

    // Recycle 200
    for (let i = 0; i < 200; i++) {
      pool.recycle(spawned[i]!);
    }
    expect(pool.activeCount).toBe(300);

    // Re-spawn 200
    for (let i = 0; i < 200; i++) {
      pool.spawn({ x: i + 1000, y: i + 1000 });
    }
    expect(pool.activeCount).toBe(500);
  });

  it('forEachActive iterates only active particles', () => {
    pool.spawn({ x: 1 });
    pool.spawn({ x: 2 });
    const p3 = pool.spawn({ x: 3 })!;
    pool.recycle(p3);

    const xs: number[] = [];
    pool.forEachActive((p) => xs.push(p.x));
    expect(xs).toEqual([1, 2]);
  });

  it('reset deactivates all particles', () => {
    for (let i = 0; i < 10; i++) pool.spawn();
    pool.reset();
    expect(pool.activeCount).toBe(0);
  });

  it('double recycle does not corrupt count', () => {
    const p = pool.spawn()!;
    pool.recycle(p);
    pool.recycle(p); // second recycle should be no-op
    expect(pool.activeCount).toBe(0);
  });
});
