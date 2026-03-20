/**
 * Particle Engine — Barrel export
 */
export { ParticleEngine } from './ParticleEngine';
export { ParticlePool } from './ParticlePool';
export {
  PointEmitter,
  RingEmitter,
  LineEmitter,
  BurstEmitter,
} from './emitters';
export type {
  RingEmitterOptions,
  LineEmitterOptions,
  BurstEmitterOptions,
} from './emitters';
export {
  AttractorForce,
  SpringForce,
  OrbitForce,
  DragForce,
  NoiseForce,
  BoundaryForce,
} from './forces';
export type {
  Vec2,
  Particle,
  SpawnConfig,
  Force,
  EmitterConfig,
  Emitter,
  Rect,
  SceneConfig,
} from './types';
export { TAU, DAMPING_DEFAULT, MAX_PARTICLES, MIN_DIST_SQ } from './types';
