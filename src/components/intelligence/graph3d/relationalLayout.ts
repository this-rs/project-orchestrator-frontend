// ============================================================================
// relationalLayout — energy-minimised layout of community/group CENTRES
// ============================================================================
//
// Phase B of "Organic Knowledge Ecosystem". Replaces the Fibonacci-sphere
// placement of group centres (useGraph3DLayout.ts, `GOLDEN_SPHERE` ring) —
// an artificial ball with long diagonals crossing it end to end — with a
// RELATIONAL layout: groups that are really connected to each other sit
// close together, groups with no external relation stay wherever they land,
// and no two envelopes (radius) ever overlap at convergence.
//
// Pure module: no `three` import, no DOM, no randomness from `Math.random` —
// every number here is a deterministic function of the input (ids, radii,
// affinities, options). `layoutGroups` runs ONE bounded pass and returns;
// there is no continuous simulation (that is the Web Worker's job, out of
// scope for this module).
//
// ── Energy ───────────────────────────────────────────────────────────────────
//
//   E = λa · E_affinity + λo · E_overlap + λs · E_stability + λr · E_anchor
//
//   E_affinity = Σ_{(g,h): a(g,h)>0}  a(g,h) · (dist(g,h) − target(g,h))²
//     target(g,h) = radius(g) + radius(h) + AFFINITY_GAP_MAX / (1 + a(g,h))
//     — the stronger the real relation, the closer the target distance (it
//     never drops below the envelope sum, so overlap is still E_overlap's job).
//
//   E_overlap  = Σ_{g≠h} max(0, (radius(g)+radius(h)+OVERLAP_MARGIN) − dist(g,h))²
//     — repulsion the instant two envelopes are closer than touching-plus-margin,
//     for EVERY pair, not only affine ones.
//
//   E_stability = Σ_g  (pos(g) − previous(g))²   (previous(g) defaults to 0
//     contribution — no term — when no previous position was supplied for g)
//
//   E_anchor = Σ_{g: N(g)≠∅}  (pos(g) − barycenter(N(g)))²
//     N(g) = the groups g has a real affinity edge to (never the whole set).
//     barycenter is the affinity-weighted average position of N(g). A group
//     with no external relation has N(g) = ∅ and contributes nothing: no
//     fictive pull toward a "core" it isn't actually connected to.
//
// All four λ are named constants below, all strictly positive.
//
// ── Minimisation ─────────────────────────────────────────────────────────────
// Analytic gradient descent, synchronous (Jacobi-style) updates: every
// iteration reads ONE snapshot of positions to compute every force, then
// applies all moves at once — so the result never depends on the order
// groups are visited or listed, only on the set of ids and their pairwise
// data. The step size decays linearly over the iteration budget (simple,
// deterministic annealing) and is clamped per step to keep the descent
// stable. Initial positions come from a deterministic hash of each group's
// id (a per-id "golden sphere" seed), never from `Math.random` or input
// array order.
// ============================================================================

/** A 3D point. */
export interface OrganicPoint {
  x: number
  y: number
  z: number
}

/** A group whose CENTRE this module places — its own internal layout (how its
 *  members are arranged inside it) is out of scope here. */
export interface RelationalGroup {
  id: string
  /** Envelope radius — already computed (log-scale) by the caller. */
  radius: number
}

/** `affinities[g][h]` = sum of the weights of every REAL relation between
 *  group g and group h (default weight 1 per relation — never invented).
 *  Only one direction needs to be populated; `affinities[g][h]` and
 *  `affinities[h][g]` are treated as the same edge (the larger of the two
 *  if both are given, so a caller that fills both directions symmetrically
 *  is read exactly as intended). */
export type AffinityMatrix = Record<string, Record<string, number>>

export interface LayoutOptions {
  /** Hard cap on relaxation iterations. Clamped to [1, MAX_ITERATION_CAP]. */
  maxIterations?: number
  /** Previous centres, e.g. from the last computed layout — pulls the result
   *  toward continuity across incremental graph updates (E_stability). */
  previousPositions?: Map<string, OrganicPoint>
}

// ── Energy weights (all > 0) ─────────────────────────────────────────────────
/** Pull toward the affinity-scaled target distance for really-connected pairs. */
const LAMBDA_AFFINITY = 1.0
/** Push apart overlapping envelopes — kept strongest so convergence never overlaps. */
const LAMBDA_OVERLAP = 6.0
/** Pull toward the previous layout, for continuity across updates. */
const LAMBDA_STABILITY = 1.5
/**
 * Pull a connected group toward the barycenter of its real neighbours.
 *
 * Kept small on purpose: for a 2-node component the "barycenter" is simply
 * the other node's own position, so this term is an UNBOUNDED extra spring
 * toward zero distance (its pull grows with the raw separation, not with
 * any overlap amount). Measured: at the original 0.4 it beat `LAMBDA_OVERLAP`
 * for a weakly-affine pair and settled them BELOW the envelope floor
 * (116.7 at radius 60+60=120). 0.05 lets `E_affinity`/`E_overlap` set the
 * resting distance — anchor only nudges a cluster's outliers toward its
 * core, it never overrides the pairwise target or the no-overlap floor.
 */
const LAMBDA_ANCHOR = 0.05

/** Extra gap (px) added to the envelope sum when two groups have NO affinity
 *  edge strong enough to pull them in — i.e. the affinity target distance at
 *  affinity → 0 is `radius sum + AFFINITY_GAP_MAX`, shrinking toward the bare
 *  envelope sum as affinity grows. */
const AFFINITY_GAP_MAX = 40
/** Minimum clear gap (px) enforced between any two envelopes at convergence —
 *  strictly positive so "touching" never reads as "overlapping". */
const OVERLAP_MARGIN = 2

/** Default and maximum iteration budget — bounded, never unbounded. */
const DEFAULT_MAX_ITERATIONS = 200
const MAX_ITERATION_CAP = 1000

/** Initial step size and its linear decay to ~0 across the iteration budget. */
const LEARNING_RATE_0 = 0.06
/** Per-step displacement clamp (px) — keeps the descent from ever exploding. */
const MAX_STEP = 24

/** Minimum distance used in direction/force maths — avoids division by zero
 *  when two centres land exactly on top of each other. */
const EPSILON = 1e-6

// ── Deterministic hash → [0,1) PRNG (mulberry32), seeded by a string id ──────
function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GOLDEN_ANGLE = 2.39996

/** Deterministic affinity lookup, symmetric: the larger of the two directions
 *  when both are populated, 0 when the pair has no edge at all. */
function affinityOf(affinities: AffinityMatrix, g: string, h: string): number {
  const ab = affinities[g]?.[h] ?? 0
  const ba = affinities[h]?.[g] ?? 0
  return Math.max(ab, ba)
}

function vecLen(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z)
}

/**
 * Lay out group CENTRES by minimising E (see module doc) with a bounded,
 * deterministic gradient descent. Same `groups`/`affinities`/`options` input
 * ⇒ same output, regardless of the order `groups` is given in.
 */
export function layoutGroups(
  groups: RelationalGroup[],
  affinities: AffinityMatrix,
  options: LayoutOptions = {},
): Map<string, OrganicPoint> {
  const result = new Map<string, OrganicPoint>()
  if (groups.length === 0) return result

  const maxIterations = Math.min(
    MAX_ITERATION_CAP,
    Math.max(1, Math.floor(options.maxIterations ?? DEFAULT_MAX_ITERATIONS)),
  )
  const previous = options.previousPositions

  // Canonical order: never the caller's array order, always sorted ids — this
  // is what makes the result independent of how `groups` was listed.
  const radiusOf = new Map(groups.map((g) => [g.id, g.radius]))
  const ids = [...radiusOf.keys()].sort()
  const n = ids.length

  // Precompute, once, the pairs that carry a real affinity edge (a(g,h) > 0),
  // and each group's neighbour list for the anchor term — both built strictly
  // from `ids` order, never from `groups` order.
  const affinityPairs: Array<{ g: string; h: string; a: number }> = []
  const neighbors = new Map<string, Array<{ h: string; a: number }>>()
  for (const id of ids) neighbors.set(id, [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const g = ids[i]
      const h = ids[j]
      const a = affinityOf(affinities, g, h)
      if (a > 0) {
        affinityPairs.push({ g, h, a })
        neighbors.get(g)!.push({ h, a })
        neighbors.get(h)!.push({ h: g, a })
      }
    }
  }

  // Deterministic initial placement: a "golden sphere" seeded by each id's
  // own hash, radius proportional to the total mass of envelopes so groups
  // start already spread apart rather than piled at the origin.
  const totalRadius = ids.reduce((s, id) => s + radiusOf.get(id)!, 0)
  const spreadRadius = Math.max(1, (totalRadius * 1.6) / Math.max(1, Math.sqrt(n)))
  const pos = new Map<string, { x: number; y: number; z: number }>()
  ids.forEach((id, i) => {
    const rng = mulberry32(hashString(id))
    const jitter = 0.85 + 0.3 * rng()
    const up = n === 1 ? 0 : 1 - (i / (n - 1)) * 2
    const around = Math.sqrt(Math.max(0, 1 - up * up))
    const angle = GOLDEN_ANGLE * i + rng() * Math.PI * 2 * 0.05
    const r = spreadRadius * jitter
    pos.set(id, {
      x: Math.cos(angle) * around * r,
      y: up * r,
      z: Math.sin(angle) * around * r,
    })
  })

  const force = new Map<string, { x: number; y: number; z: number }>()

  for (let iter = 0; iter < maxIterations; iter++) {
    for (const id of ids) force.set(id, { x: 0, y: 0, z: 0 })

    const addForce = (id: string, fx: number, fy: number, fz: number) => {
      const f = force.get(id)!
      f.x += fx
      f.y += fy
      f.z += fz
    }

    // E_affinity: spring toward the affinity-scaled target distance.
    for (const { g, h, a } of affinityPairs) {
      const pg = pos.get(g)!
      const ph = pos.get(h)!
      const dx = pg.x - ph.x
      const dy = pg.y - ph.y
      const dz = pg.z - ph.z
      const dist = Math.max(EPSILON, vecLen(dx, dy, dz))
      const target = radiusOf.get(g)! + radiusOf.get(h)! + AFFINITY_GAP_MAX / (1 + a)
      const diff = dist - target
      const coeff = (LAMBDA_AFFINITY * a * 2 * diff) / dist
      // Force on g = -∇_g E = -coeff · (pg - ph)
      addForce(g, -coeff * dx, -coeff * dy, -coeff * dz)
      addForce(h, coeff * dx, coeff * dy, coeff * dz)
    }

    // E_overlap: repulsion for EVERY pair whose envelopes are closer than
    // touching-plus-margin, affine or not.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const g = ids[i]
        const h = ids[j]
        const pg = pos.get(g)!
        const ph = pos.get(h)!
        const dx = pg.x - ph.x
        const dy = pg.y - ph.y
        const dz = pg.z - ph.z
        const dist = Math.max(EPSILON, vecLen(dx, dy, dz))
        const minDist = radiusOf.get(g)! + radiusOf.get(h)! + OVERLAP_MARGIN
        const overlap = minDist - dist
        if (overlap <= 0) continue
        const coeff = (LAMBDA_OVERLAP * 2 * overlap) / dist
        // Force on g = -∇_g E = +coeff · (pg - ph) → pushes g away from h.
        addForce(g, coeff * dx, coeff * dy, coeff * dz)
        addForce(h, -coeff * dx, -coeff * dy, -coeff * dz)
      }
    }

    // E_stability: spring toward the previous position, when supplied.
    if (previous) {
      for (const id of ids) {
        const prev = previous.get(id)
        if (!prev) continue
        const p = pos.get(id)!
        addForce(id, -2 * LAMBDA_STABILITY * (p.x - prev.x), -2 * LAMBDA_STABILITY * (p.y - prev.y), -2 * LAMBDA_STABILITY * (p.z - prev.z))
      }
    }

    // E_anchor: spring toward the affinity-weighted barycenter of REAL
    // neighbours only — isolated groups (no neighbours) get no anchor force.
    for (const id of ids) {
      const ns = neighbors.get(id)!
      if (ns.length === 0) continue
      let wx = 0
      let wy = 0
      let wz = 0
      let wsum = 0
      for (const { h, a } of ns) {
        const ph = pos.get(h)!
        wx += ph.x * a
        wy += ph.y * a
        wz += ph.z * a
        wsum += a
      }
      if (wsum <= 0) continue
      const bx = wx / wsum
      const by = wy / wsum
      const bz = wz / wsum
      const p = pos.get(id)!
      addForce(id, -2 * LAMBDA_ANCHOR * (p.x - bx), -2 * LAMBDA_ANCHOR * (p.y - by), -2 * LAMBDA_ANCHOR * (p.z - bz))
    }

    // Synchronous apply: every move uses the SAME snapshot of positions that
    // produced every force above, so the result never depends on id order.
    const lr = LEARNING_RATE_0 * (1 - iter / maxIterations)
    for (const id of ids) {
      const f = force.get(id)!
      const p = pos.get(id)!
      let dx = lr * f.x
      let dy = lr * f.y
      let dz = lr * f.z
      const mag = vecLen(dx, dy, dz)
      if (mag > MAX_STEP) {
        const scale = MAX_STEP / mag
        dx *= scale
        dy *= scale
        dz *= scale
      }
      pos.set(id, { x: p.x + dx, y: p.y + dy, z: p.z + dz })
    }
  }

  for (const id of ids) {
    const p = pos.get(id)!
    result.set(id, {
      x: Number.isFinite(p.x) ? p.x : 0,
      y: Number.isFinite(p.y) ? p.y : 0,
      z: Number.isFinite(p.z) ? p.z : 0,
    })
  }
  return result
}
