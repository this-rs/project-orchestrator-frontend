/**
 * The maths of the compaction animation, kept apart from the canvas so it can be tested.
 *
 * Reading: a wide field of particles (the context window) is drawn toward a small dense core
 * (the summary). Each particle loops independently: it is born on the edge of the field, spirals
 * in, shrinks and fades as it merges. The core pulses with the arrivals.
 */

export interface Particle {
  /** Birth position, as a fraction of the field (0..1). */
  x: number
  y: number
  /** Start of the particle's loop, as a fraction of the loop (0..1). */
  offset: number
  /** Loop length multiplier (0.8..1.2), so arrivals do not land in lockstep. */
  speed: number
  /** Spiral direction and strength (-1..1). */
  swirl: number
  size: number
}

export interface Pose {
  x: number
  y: number
  radius: number
  alpha: number
}

/** Small seeded generator: a given seed always draws the same field. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeParticles(count: number, seed = 1): Particle[] {
  const rand = mulberry32(seed)
  return Array.from({ length: count }, () => {
    // Born on the left and right thirds of the field: the core sits in the middle.
    const side = rand() < 0.5 ? 0 : 1
    return {
      x: side === 0 ? rand() * 0.38 : 0.62 + rand() * 0.38,
      y: 0.08 + rand() * 0.84,
      offset: rand(),
      speed: 0.8 + rand() * 0.4,
      swirl: (rand() - 0.5) * 2,
      size: 0.8 + rand() * 1.4,
    }
  })
}

const easeInCubic = (t: number) => t * t * t
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Length of one particle loop. */
export const LOOP_MS = 2600

/** Where a particle is at `timeMs`, in pixels, for a field of `w` x `h`. */
export function poseAt(p: Particle, timeMs: number, w: number, h: number): Pose {
  const phase = (((timeMs / (LOOP_MS * p.speed)) + p.offset) % 1 + 1) % 1
  const k = easeInCubic(phase)
  const cx = w / 2
  const cy = h / 2
  const sx = p.x * w
  const sy = p.y * h
  // Straight pull toward the core, bent sideways by a spiral that dies out on arrival.
  const dx = cx - sx
  const dy = cy - sy
  const bend = Math.sin(phase * Math.PI) * p.swirl * 0.35
  const x = sx + dx * k - dy * bend
  const y = sy + dy * k + dx * bend * 0.4
  const fadeIn = clamp01(phase / 0.12)
  const fadeOut = 1 - clamp01((phase - 0.82) / 0.18)
  return { x, y, radius: p.size * (1 - 0.7 * k), alpha: fadeIn * fadeOut }
}

/** Core pulse (0..1): rises as particles arrive, never fully rests. */
export function corePulse(timeMs: number): number {
  return 0.55 + 0.45 * Math.sin((timeMs / LOOP_MS) * Math.PI * 2)
}
