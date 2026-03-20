/**
 * Particle Engine — Core Types
 *
 * Simulation uses semi-implicit Euler (symplectic):
 *   v += a·dt → x += v·dt (position uses NEW velocity)
 */

// ── Constants ──────────────────────────────────────────────
export const TAU = Math.PI * 2;
export const DAMPING_DEFAULT = 0.98;
export const MAX_PARTICLES = 1024;
export const MIN_DIST_SQ = 1; // avoid division by zero in force calcs

// ── Vec2 ───────────────────────────────────────────────────
export interface Vec2 {
  x: number;
  y: number;
}

// ── Particle ───────────────────────────────────────────────
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number; // 0..1 (1 = born, 0 = dead)
  maxLife: number; // seconds
  size: number; // radius in px
  opacity: number; // 0..1
  color: string; // hex or rgba
  mass: number; // for force calculations
  group: number; // cluster/group id
  active: boolean; // pool management
  metadata: Record<string, unknown>; // opaque data for interaction callbacks
}

// ── Spawn Config ───────────────────────────────────────────
export interface SpawnConfig {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  maxLife?: number;
  size?: number;
  opacity?: number;
  color?: string;
  mass?: number;
  group?: number;
  metadata?: Record<string, unknown>;
}

// ── Force ──────────────────────────────────────────────────
export interface Force {
  apply(p: Particle, dt: number, time: number): void;
}

// ── Emitter ────────────────────────────────────────────────
export interface EmitterConfig {
  position: Vec2;
  rate: number; // particles per second
  spread: number; // angle spread in radians
  angle: number; // emission direction
  speed: number; // initial velocity magnitude
  config: SpawnConfig;
}

export interface Emitter {
  emit(pool: import('./ParticlePool').ParticlePool, config: EmitterConfig): void;
}

// ── Rect ────────────────────────────────────────────────────
export interface Rect {
  width: number;
  height: number;
}

// ── Scene Config ───────────────────────────────────────────
export interface SceneConfig {
  maxParticles: number;
  damping: number;
  forces: Force[];
  emitters: Emitter[];
  backgroundColor: string;
  width: number;
  height: number;
}

// ── Note ─────────────────────────────────────────────────────
// The real scene interface is `ParticleScene` in `scenes/types.ts`.
// Scene registry lives in `scenes/index.ts` (SCENE_REGISTRY).
