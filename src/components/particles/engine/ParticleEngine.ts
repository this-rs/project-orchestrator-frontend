/**
 * ParticleEngine — Physics simulation loop.
 *
 * Semi-implicit Euler integration:
 *   reset acceleration → apply forces → v += a·dt → v *= damping → x += v·dt
 *   life -= dt/maxLife → recycle dead particles
 */

import type { Force, Particle } from './types';
import { DAMPING_DEFAULT } from './types';
import { ParticlePool } from './ParticlePool';

export class ParticleEngine {
  readonly pool: ParticlePool;
  private forces: Force[] = [];
  private _damping: number;

  constructor(pool: ParticlePool, damping: number = DAMPING_DEFAULT) {
    this.pool = pool;
    this._damping = damping;
  }

  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    this._damping = value;
  }

  addForce(force: Force): void {
    this.forces.push(force);
  }

  removeForce(force: Force): void {
    const idx = this.forces.indexOf(force);
    if (idx !== -1) this.forces.splice(idx, 1);
  }

  clearForces(): void {
    this.forces.length = 0;
  }

  /**
   * Advance simulation by dt seconds.
   */
  step(dt: number, time: number): void {
    const pool = this.pool;
    const forces = this.forces;
    const damping = this._damping;
    const forceCount = forces.length;

    pool.forEachActive((p: Particle) => {
      // Reset acceleration
      p.ax = 0;
      p.ay = 0;

      // Apply all forces
      for (let f = 0; f < forceCount; f++) {
        forces[f].apply(p, dt, time);
      }

      // Semi-implicit Euler: velocity first, then position
      p.vx = (p.vx + p.ax * dt) * damping;
      p.vy = (p.vy + p.ay * dt) * damping;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Life decay
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        pool.recycle(p);
      }
    });
  }

  reset(): void {
    this.forces.length = 0;
    this.pool.reset();
  }
}
