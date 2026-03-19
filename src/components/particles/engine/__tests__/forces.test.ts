/**
 * Force tests — verify each force's physics behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ParticlePool } from '../ParticlePool';
import {
  AttractorForce,
  SpringForce,
  OrbitForce,
  DragForce,
  NoiseForce,
  BoundaryForce,
} from '../forces';
import type { Particle } from '../types';

function spawnAt(
  pool: ParticlePool,
  x: number,
  y: number,
  vx = 0,
  vy = 0,
): Particle {
  return pool.spawn({ x, y, vx, vy, maxLife: 999 })!;
}

describe('AttractorForce', () => {
  it('accelerates particle toward target', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 100, 0);
    const attractor = new AttractorForce({
      target: { x: 0, y: 0 },
      strength: 1000,
    });

    attractor.apply(p, 0.016, 0);
    expect(p.ax).toBeLessThan(0); // pulled left toward origin
    expect(Math.abs(p.ay)).toBeLessThan(0.001); // no y component
  });

  it('force increases as particle gets closer (inverse-square)', () => {
    const pool = new ParticlePool(4);
    const pFar = spawnAt(pool, 100, 0);
    const pNear = spawnAt(pool, 10, 0);
    const attractor = new AttractorForce({
      target: { x: 0, y: 0 },
      strength: 1000,
    });

    attractor.apply(pFar, 0.016, 0);
    attractor.apply(pNear, 0.016, 0);
    expect(Math.abs(pNear.ax)).toBeGreaterThan(Math.abs(pFar.ax));
  });
});

describe('SpringForce', () => {
  it('pulls particle toward anchor when beyond rest length', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 100, 0);
    const spring = new SpringForce({
      anchor: { x: 0, y: 0 },
      stiffness: 0.5,
      restLength: 20,
    });

    spring.apply(p, 0.016, 0);
    expect(p.ax).toBeLessThan(0); // pulled toward anchor
  });

  it('pushes particle away when inside rest length', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 5, 0);
    const spring = new SpringForce({
      anchor: { x: 0, y: 0 },
      stiffness: 0.5,
      restLength: 20,
    });

    spring.apply(p, 0.016, 0);
    expect(p.ax).toBeGreaterThan(0); // pushed away (displacement negative → force reverses)
  });

  it('converges toward rest length over many steps', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 100, 0);
    const spring = new SpringForce({
      anchor: { x: 0, y: 0 },
      stiffness: 0.5,
      restLength: 30,
    });

    // Manual integration for 5000 steps with strong damping
    for (let i = 0; i < 5000; i++) {
      p.ax = 0;
      p.ay = 0;
      spring.apply(p, 0.016, 0);
      p.vx = (p.vx + p.ax * 0.016) * 0.9;
      p.vy = (p.vy + p.ay * 0.016) * 0.9;
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
    }

    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    // Should converge near rest length (within ±5px)
    expect(Math.abs(dist - 30)).toBeLessThan(5);
  });
});

describe('OrbitForce', () => {
  it('applies centripetal + tangential forces', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, 0);
    const orbit = new OrbitForce({
      center: { x: 0, y: 0 },
      speed: 2,
      tangentialStrength: 1,
    });

    orbit.apply(p, 0.016, 0);
    // Centripetal: ax should be negative (toward center)
    expect(p.ax).toBeLessThan(0);
    // Tangential: ay should be non-zero (perpendicular)
    expect(p.ay).not.toBe(0);
  });

  it('maintains approximate orbit radius over time', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, 0);
    const orbit = new OrbitForce({
      center: { x: 0, y: 0 },
      speed: 3,
      tangentialStrength: 1,
    });

    for (let i = 0; i < 500; i++) {
      p.ax = 0;
      p.ay = 0;
      orbit.apply(p, 0.016, 0);
      p.vx = (p.vx + p.ax * 0.016) * 0.99;
      p.vy = (p.vy + p.ay * 0.016) * 0.99;
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
    }

    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    // Should stay in a reasonable orbit (not fly away or collapse)
    expect(dist).toBeGreaterThan(5);
    expect(dist).toBeLessThan(200);
  });
});

describe('DragForce', () => {
  it('opposes velocity (linear drag)', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 0, 0, 10, 5);
    const drag = new DragForce({ coefficient: 0.1 });

    drag.apply(p, 0.016, 0);
    expect(p.ax).toBeLessThan(0); // opposes positive vx
    expect(p.ay).toBeLessThan(0); // opposes positive vy
  });

  it('reduces speed over time', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 0, 0, 100, 0);
    const drag = new DragForce({ coefficient: 2 });

    const initialSpeed = Math.abs(p.vx);
    for (let i = 0; i < 100; i++) {
      p.ax = 0;
      p.ay = 0;
      drag.apply(p, 0.016, 0);
      p.vx += p.ax * 0.016;
      p.vy += p.ay * 0.016;
      p.x += p.vx * 0.016;
    }

    expect(Math.abs(p.vx)).toBeLessThan(initialSpeed);
  });
});

describe('NoiseForce', () => {
  it('adds non-zero acceleration', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, 50);
    const noise = new NoiseForce({ amplitude: 100, frequency: 0.01, speed: 1 });

    noise.apply(p, 0.016, 1.0);
    const mag = Math.sqrt(p.ax * p.ax + p.ay * p.ay);
    expect(mag).toBeGreaterThan(0);
  });

  it('produces different values at different positions', () => {
    const pool = new ParticlePool(4);
    const p1 = spawnAt(pool, 0, 0);
    const p2 = spawnAt(pool, 500, 500);
    const noise = new NoiseForce({ amplitude: 100, frequency: 0.01 });

    noise.apply(p1, 0.016, 0);
    const ax1 = p1.ax;
    noise.apply(p2, 0.016, 0);
    // p2.ax includes noise contribution added to whatever was already 0
    // They should differ (different positions in noise field)
    expect(p2.ax).not.toBeCloseTo(ax1, 2);
  });
});

describe('BoundaryForce', () => {
  const bounds = { left: 0, right: 100, top: 0, bottom: 100, bounce: 0.5 };

  it('bounces particle off left wall', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, -5, 50, -10, 0);
    const boundary = new BoundaryForce(bounds);

    boundary.apply(p, 0.016, 0);
    expect(p.x).toBe(0);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vx).toBe(5); // abs(-10) * 0.5
  });

  it('bounces particle off right wall', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 105, 50, 10, 0);
    const boundary = new BoundaryForce(bounds);

    boundary.apply(p, 0.016, 0);
    expect(p.x).toBe(100);
    expect(p.vx).toBeLessThan(0);
  });

  it('bounces particle off top wall', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, -5, 0, -10);
    const boundary = new BoundaryForce(bounds);

    boundary.apply(p, 0.016, 0);
    expect(p.y).toBe(0);
    expect(p.vy).toBeGreaterThan(0);
  });

  it('bounces particle off bottom wall', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, 105, 0, 10);
    const boundary = new BoundaryForce(bounds);

    boundary.apply(p, 0.016, 0);
    expect(p.y).toBe(100);
    expect(p.vy).toBeLessThan(0);
  });

  it('does nothing when particle is inside bounds', () => {
    const pool = new ParticlePool(4);
    const p = spawnAt(pool, 50, 50, 5, 5);
    const boundary = new BoundaryForce(bounds);

    boundary.apply(p, 0.016, 0);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
    expect(p.vx).toBe(5);
    expect(p.vy).toBe(5);
  });
});
