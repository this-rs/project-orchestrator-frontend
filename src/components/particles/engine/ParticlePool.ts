/**
 * ParticlePool — Pre-allocated object pool for zero-alloc hot loop.
 *
 * All particles are created once at init. spawn() reactivates a dead particle,
 * recycle() deactivates it. No `new` in the simulation loop.
 */

import type { Particle, SpawnConfig } from './types';
import { MAX_PARTICLES } from './types';

function createDeadParticle(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    opacity: 1,
    color: '#ffffff',
    mass: 1,
    group: 0,
    active: false,
    metadata: {},
  };
}

export class ParticlePool {
  readonly particles: Particle[];
  private readonly capacity: number;
  private _activeCount = 0;

  constructor(capacity: number = MAX_PARTICLES) {
    this.capacity = capacity;
    this.particles = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.particles[i] = createDeadParticle();
    }
  }

  get activeCount(): number {
    return this._activeCount;
  }

  /**
   * Activate a dead particle with the given config.
   * Returns the particle, or null if pool is full.
   */
  spawn(config: SpawnConfig = {}): Particle | null {
    if (this._activeCount >= this.capacity) return null;

    // Linear scan for inactive slot — pool is small (1024) so this is fine
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.x = config.x ?? 0;
        p.y = config.y ?? 0;
        p.vx = config.vx ?? 0;
        p.vy = config.vy ?? 0;
        p.ax = 0;
        p.ay = 0;
        p.maxLife = config.maxLife ?? 3;
        p.life = 1;
        p.size = config.size ?? 2;
        p.opacity = config.opacity ?? 1;
        p.color = config.color ?? '#ffffff';
        p.mass = config.mass ?? 1;
        p.group = config.group ?? 0;
        p.metadata = config.metadata ?? {};
        p.active = true;
        this._activeCount++;
        return p;
      }
    }

    return null;
  }

  /**
   * Deactivate a particle, returning it to the pool.
   */
  recycle(p: Particle): void {
    if (p.active) {
      p.active = false;
      p.metadata = {};
      this._activeCount--;
    }
  }

  /**
   * Iterate over active particles only. Zero allocation.
   */
  forEachActive(callback: (p: Particle, index: number) => void): void {
    let seen = 0;
    for (let i = 0; i < this.capacity && seen < this._activeCount; i++) {
      const p = this.particles[i];
      if (p.active) {
        callback(p, i);
        seen++;
      }
    }
  }

  /**
   * Hit-test: find the closest active particle within a radius (in CSS px).
   * DPR-aware: caller passes mouse coords in CSS space.
   * Returns the particle or null if none within radius.
   */
  hitTest(
    mouseX: number,
    mouseY: number,
    radius: number = 15,
  ): Particle | null {
    let closest: Particle | null = null;
    let closestDistSq = radius * radius;
    let seen = 0;

    for (let i = 0; i < this.capacity && seen < this._activeCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      seen++;

      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const distSq = dx * dx + dy * dy;

      // Use particle size as minimum hit area (at least 8px radius)
      const hitRadius = Math.max(p.size, 8);
      const effectiveRadiusSq = Math.max(hitRadius * hitRadius, closestDistSq);

      if (distSq < effectiveRadiusSq && distSq < closestDistSq) {
        closestDistSq = distSq;
        closest = p;
      }
    }

    return closest;
  }

  /**
   * Deactivate all particles.
   */
  reset(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.particles[i].active = false;
    }
    this._activeCount = 0;
  }
}
