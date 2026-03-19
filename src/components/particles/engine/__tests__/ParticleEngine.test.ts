/**
 * ParticleEngine tests — verify simulation loop, force integration, and lifecycle.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleEngine } from '../ParticleEngine';
import { ParticlePool } from '../ParticlePool';
import { AttractorForce, DragForce } from '../forces';
import type { Force, Particle } from '../types';

describe('ParticleEngine', () => {
  let pool: ParticlePool;
  let engine: ParticleEngine;

  beforeEach(() => {
    pool = new ParticlePool(256);
    engine = new ParticleEngine(pool, 0.98);
  });

  it('step integrates velocity and position', () => {
    const p = pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, maxLife: 999 })!;
    engine.step(0.016, 0);

    // vx = (10 + 0) * 0.98 = 9.8, x = 0 + 9.8 * 0.016
    expect(p.vx).toBeCloseTo(9.8, 4);
    expect(p.x).toBeCloseTo(9.8 * 0.016, 4);
  });

  it('applies forces to modify acceleration', () => {
    const p = pool.spawn({ x: 100, y: 0, maxLife: 999 })!;
    engine.addForce(
      new AttractorForce({ target: { x: 0, y: 0 }, strength: 1000 }),
    );
    engine.step(0.016, 0);

    expect(p.vx).toBeLessThan(0); // attracted toward origin
  });

  it('decrements life and recycles dead particles', () => {
    pool.spawn({ maxLife: 0.1 })!;
    expect(pool.activeCount).toBe(1);

    // After enough steps, particle should die
    for (let i = 0; i < 20; i++) {
      engine.step(0.016, i * 0.016);
    }
    expect(pool.activeCount).toBe(0);
  });

  it('100 particles converge toward attractor target', () => {
    const target = { x: 200, y: 200 };
    engine.addForce(new AttractorForce({ target, strength: 100000 }));
    engine.addForce(new DragForce({ coefficient: 5 }));

    // Spawn 100 particles at deterministic positions, record initial distances
    const initialPositions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 100; i++) {
      const x = (i * 4) % 400;
      const y = ((i * 7) + 50) % 400;
      initialPositions.push({ x, y });
      pool.spawn({ x, y, maxLife: 999 });
    }

    // Compute initial average distance
    let initialAvgDist = 0;
    for (const pos of initialPositions) {
      const dx = pos.x - target.x;
      const dy = pos.y - target.y;
      initialAvgDist += Math.sqrt(dx * dx + dy * dy);
    }
    initialAvgDist /= initialPositions.length;

    // Run 500 steps
    for (let i = 0; i < 500; i++) {
      engine.step(0.016, i * 0.016);
    }

    // Compute final average distance — should be significantly closer
    let finalAvgDist = 0;
    let count = 0;
    pool.forEachActive((p) => {
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      finalAvgDist += Math.sqrt(dx * dx + dy * dy);
      count++;
    });
    finalAvgDist /= count;

    // Particles should have moved closer to target (inverse-square weakens at distance)
    expect(finalAvgDist).toBeLessThan(initialAvgDist);
  });

  it('addForce and removeForce work correctly', () => {
    const force: Force = {
      apply(p: Particle) {
        p.ax += 100;
      },
    };

    engine.addForce(force);
    const p = pool.spawn({ x: 0, y: 0, maxLife: 999 })!;
    engine.step(0.016, 0);
    expect(p.vx).toBeGreaterThan(0);

    // Remove force and reset
    engine.removeForce(force);
    p.vx = 0;
    p.ax = 0;
    engine.step(0.016, 0);
    // Only damping applied, no force → vx should be ~0
    expect(Math.abs(p.vx)).toBeLessThan(0.001);
  });

  it('clearForces removes all forces', () => {
    engine.addForce(
      new AttractorForce({ target: { x: 0, y: 0 }, strength: 1000 }),
    );
    engine.addForce(new DragForce({ coefficient: 1 }));
    engine.clearForces();

    const p = pool.spawn({ x: 100, y: 0, vx: 0, vy: 0, maxLife: 999 })!;
    engine.step(0.016, 0);
    // No forces, vx=0 → damping on zero = zero → x stays at 100
    expect(p.x).toBe(100);
  });

  it('reset clears forces and pool', () => {
    engine.addForce(new DragForce({ coefficient: 1 }));
    pool.spawn({ maxLife: 999 });
    pool.spawn({ maxLife: 999 });

    engine.reset();
    expect(pool.activeCount).toBe(0);
  });

  it('damping can be changed at runtime', () => {
    engine.damping = 0.5;
    const p = pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, maxLife: 999 })!;
    engine.step(0.016, 0);
    expect(p.vx).toBeCloseTo(5, 4); // 10 * 0.5
  });
});
