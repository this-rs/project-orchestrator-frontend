/**
 * The maths of the compaction animation, kept apart from the canvas so it can be tested.
 *
 * Reading: the context window is an accretion disc seen at a tilt. Matter orbits a small dense
 * core (the summary) and falls in on a tightening spiral: it speeds up (angular speed grows as
 * the radius shrinks), heats from cold indigo to white-cyan, and is swallowed at the core. Depth
 * comes from the tilt: the near side of the disc is larger and brighter than the far side.
 *
 * Everything here is a pure function of (particle, time): no state between frames, which is what
 * lets the canvas draw a velocity streak by sampling the same particle a few ms earlier.
 */

export interface Particle {
  /** Starting radius as a fraction of the disc (0.3..1). */
  r0: number
  /** Starting angle (radians). */
  theta0: number
  /** Orbit direction is shared (+1); this scales the spin so streams do not move in lockstep. */
  spin: number
  /** Loop length multiplier (0.8..1.25), so arrivals do not land together. */
  speed: number
  /** Loop start, as a fraction of the loop (0..1). */
  offset: number
  /** Vertical thickness of the disc at birth (-1..1). */
  z: number
  size: number
}

export interface Pose {
  x: number
  y: number
  radius: number
  alpha: number
  /** 0 cold (outer) .. 1 white-hot (about to be swallowed). */
  heat: number
  /** -1 far side of the disc .. 1 near side. */
  depth: number
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
  return Array.from({ length: count }, () => ({
    // Denser toward the rim than near the core, as a real disc is.
    r0: 0.3 + 0.7 * Math.sqrt(rand()),
    theta0: rand() * Math.PI * 2,
    spin: 0.85 + rand() * 0.3,
    speed: 0.8 + rand() * 0.45,
    offset: rand(),
    z: rand() * 2 - 1,
    size: 0.7 + rand() * 1.5,
  }))
}

/** Length of one particle loop. */
export const LOOP_MS = 3400

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Disc geometry for a field of w x h: semi-axes of the orbit ellipse. */
export function disc(w: number, h: number) {
  return { cx: w / 2, cy: h / 2, a: w * 0.46, b: h * 0.3 }
}

/** Where a particle is at `timeMs`, in pixels, for a field of `w` x `h`. */
export function poseAt(p: Particle, timeMs: number, w: number, h: number): Pose {
  const phase = ((timeMs / (LOOP_MS * p.speed) + p.offset) % 1 + 1) % 1
  // Slow at first, then the fall accelerates.
  const k = Math.pow(phase, 2.4)
  const r = p.r0 * (1 - k) + 0.015
  // Angular speed grows as the radius shrinks: Kepler-ish, 4 turns of spiral over the fall.
  const theta = p.theta0 + p.spin * (phase * 1.5 + 5 * k) * Math.PI * 2 * 0.5
  const { cx, cy, a, b } = disc(w, h)
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const depth = sin
  const x = cx + r * a * cos
  // The disc is tilted: y compresses, and the disc is thick at the rim and thin at the core.
  const y = cy + r * b * sin + p.z * h * 0.1 * (1 - k) * r
  const near = 0.8 + 0.3 * depth
  const fadeIn = clamp01(phase / 0.1)
  const fadeOut = 1 - clamp01((phase - 0.9) / 0.1)
  return {
    x,
    y,
    radius: p.size * near * (1 - 0.55 * k),
    alpha: fadeIn * fadeOut * (0.55 + 0.45 * k) * (0.7 + 0.3 * (depth * 0.5 + 0.5)),
    heat: k,
    depth,
  }
}

/** Core pulse (0..1): a slow breath with a faster flutter, never fully at rest. */
export function corePulse(timeMs: number): number {
  const t = timeMs / LOOP_MS
  return 0.6 + 0.3 * Math.sin(t * Math.PI * 2) + 0.1 * Math.sin(t * Math.PI * 9)
}

const COLD: [number, number, number] = [99, 102, 241] // indigo-500
const WARM: [number, number, number] = [56, 189, 248] // sky-400
const HOT: [number, number, number] = [236, 254, 255] // near white

/** Colour of a particle for a heat in 0..1, as an `r, g, b` triplet. */
export function heatColor(heat: number): string {
  const h = clamp01(heat)
  const [from, to, t] = h < 0.6 ? [COLD, WARM, h / 0.6] : [WARM, HOT, (h - 0.6) / 0.4]
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * t))
  return `${c[0]}, ${c[1]}, ${c[2]}`
}
