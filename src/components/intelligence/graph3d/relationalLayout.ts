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
//   E = λa · E_affinity + λs · E_stability + λr · E_anchor
//
// Overlap is NOT part of the energy any more: it is a CONSTRAINT, enforced by
// a projection pass after the descent (see "Separation" below). The constraint
// is per pair: envelopes may never touch unless the pair is affine, in which
// case only the cores must stay apart. Keeping it as
// a soft penalty was measured to fail — 940 of 19 900 pairs still overlapped
// at 200 groups, and tripling the iterations removed 7 % of them — because
// `E_anchor` pulls a group toward its neighbours' barycentre, which can lie
// inside a third group, so the penalty was locked in a tug of war it could
// never win while paying O(n²) per iteration.
//
//   E_affinity = Σ_{(g,h): a(g,h)>0}  a(g,h) · (dist(g,h) − target(g,h))²
//     target(g,h) = envelope · (1 − MAX_SHARED_ENVELOPE · a/(a+2)), floored at
//     the hard distance. The stronger the real relation, the more of its halo
//     a pair shares — a strong pair rests at ~55 % of its envelope sum, a weak
//     one near it, and unrelated groups never come closer than their envelopes.
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
// All three λ are named constants below, all strictly positive.
//
// ── Minimisation ─────────────────────────────────────────────────────────────
// Analytic gradient descent, synchronous (Jacobi-style) updates: every
// iteration reads ONE snapshot of positions to compute every force, then
// applies all moves at once — so the result never depends on the order
// groups are visited or listed, only on the set of ids and their pairwise
// data. The step size decays linearly over the iteration budget (simple,
// deterministic annealing) and is clamped per step to keep the descent
// stable.
//
// ── Initial placement ────────────────────────────────────────────────────────
// A VOLUME, not a shell: each group starts at a radius ∝ cbrt(rank) on a
// golden-angle spiral, and the outer radius is the tightest sphere that holds
// every envelope at PACKING_FRACTION. The previous version gave every group
// the SAME radius, which is why the graph read as a hollow ball with unrelated
// groups arbitrarily far apart.
//
// ── Separation ───────────────────────────────────────────────────────────────
// After the descent, a position-based projection visits the penetrating pairs
// (found through a uniform grid, never all n² pairs) in canonical order and
// moves each apart by half the penetration, repeating until a pass finds
// nothing to do or SEPARATION_ITERATIONS is spent. The distance it enforces is
// `hardDistance`: envelope for unrelated groups, core for related ones.
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

/**
 * Fraction of a group's radius that its CORE occupies (the hubs). Two groups
 * joined by a real relation may share their HALOS down to their cores
 * touching; two groups with no relation may not share anything at all.
 *
 * This is what makes "connected groups sit close together" true of the
 * DISTANCE and not only of the ordering: while overlap was forbidden for every
 * pair alike, a linked pair could never rest closer than an unlinked one — its
 * target was `envelope sum + gap/(1+a)`, always ABOVE the unlinked floor, so
 * the affinity term was literally pushing related groups farther apart than
 * the projection allowed unrelated ones. Measured on the six-group fixture:
 * the linked pair sat at 175 px and an unlinked pair at 149 px.
 */
export const CORE_RATIO = 0.45

/**
 * Share of the envelope sum an infinitely strong relation may remove from the
 * resting distance. 0.45 keeps a strong pair at 55 % of the envelope sum, so
 * even a hub-to-hub relation never collapses two groups onto each other.
 */
const MAX_SHARED_ENVELOPE = 0.45
/** Minimum clear gap (px) enforced between any two envelopes at convergence —
 *  strictly positive so "touching" never reads as "overlapping". */
const OVERLAP_MARGIN = 2

/** Default and maximum iteration budget — bounded, never unbounded. */
const DEFAULT_MAX_ITERATIONS = 200
const MAX_ITERATION_CAP = 1000

/**
 * Projection passes that remove any remaining envelope overlap.
 *
 * The energy descent alone does NOT converge on separation: the anchor term
 * pulls a group toward its neighbours' barycentre, which can lie inside a
 * third group, so a soft penalty ends up in a tug of war it cannot win.
 * Measured at 200 groups: 940 overlapping pairs out of 19 900 (4.7 %), and
 * tripling the iterations to 600 only removed 7 % of them. A position-based
 * projection removes them by construction instead: each pass moves every
 * penetrating pair apart by half its penetration.
 */
const SEPARATION_ITERATIONS = 400

/** Stop projecting once a whole pass moves nothing by more than this (px).
 *  Under a quarter pixel no overlap is visible, and chasing it cost most of the
 *  budget: the loop used to spend all 400 passes on sub-pixel corrections
 *  (measured 1437 ms at 200 groups, against 344 ms at 60 passes with the same
 *  final quality). The criterion is the DISPLACEMENT, not the penetration read
 *  at visit time — in a dense pack that value stays high even at equilibrium,
 *  because the pair is resolved by pushes applied earlier or later in the same
 *  pass. */
const SEPARATION_TOLERANCE = 0.25

/** Upper bound on the uniform inflation applied before the projection. */
const MAX_INFLATION = 4

/**
 * Fraction of the bounding sphere the group envelopes are assumed to occupy
 * at the initial placement. Random sphere packing sits near 0.64; a lower
 * value leaves room for the descent to pull related groups together instead
 * of starting them jammed against each other.
 */
const PACKING_FRACTION = 0.4

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

/** The distance two centres may never fall below. Unrelated groups: their
 *  envelopes never touch. Related groups: their cores never touch, their halos
 *  may interpenetrate — that is how a relation reads at a glance. */
function hardDistance(rg: number, rh: number, affinity: number): number {
  const envelope = rg + rh
  if (affinity <= 0) return envelope + OVERLAP_MARGIN
  return envelope * CORE_RATIO + OVERLAP_MARGIN
}

/** Resting distance of an affine pair: the shared halo grows with the number
 *  of real links, bounded by MAX_SHARED_ENVELOPE. */
function affinityTarget(rg: number, rh: number, a: number): number {
  const envelope = rg + rh
  const shared = MAX_SHARED_ENVELOPE * (a / (a + 2))
  return Math.max(hardDistance(rg, rh, a), envelope * (1 - shared))
}

// ── Uniform grid over the centres ───────────────────────────────────────────
// Every pairwise interaction here is exactly zero beyond
// `2·maxRadius + OVERLAP_MARGIN`: an affinity spring does not exist between
// unconnected groups, and a repulsion does not exist between envelopes that do
// not touch. Bucketing the centres with that cell size therefore makes each
// query examine only the 27 neighbouring cells, turning the O(n²) per-iteration
// sweep into O(n·k). Measured on the previous all-pairs loop: 2 827 ms for 500
// groups, which is the "layout step" that blocked the page.
/**
 * Numeric cell key. A template string was measurably too slow here: the grid is
 * rebuilt once per descent iteration plus once per separation pass, and each
 * rebuild asks for 27 keys per group — 2.7 million string allocations at 500
 * groups. Three odd multipliers XORed give a well-spread integer that a Map
 * takes directly.
 */
function cellKey(cx: number, cy: number, cz: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) | 0
}

function buildGrid(
  ids: string[],
  pos: Map<string, { x: number; y: number; z: number }>,
  cell: number,
): Map<number, string[]> {
  const buckets = new Map<number, string[]>()
  for (const id of ids) {
    const p = pos.get(id)!
    const k = cellKey(
      Math.floor(p.x / cell),
      Math.floor(p.y / cell),
      Math.floor(p.z / cell),
    )
    const bucket = buckets.get(k)
    if (bucket) bucket.push(id)
    else buckets.set(k, [id])
  }
  return buckets
}

/** The buckets a point can interact with: its own cell and the 26 around it. */
function neighboursOf(
  buckets: Map<number, string[]>,
  p: { x: number; y: number; z: number },
  cell: number,
): string[][] {
  const cx = Math.floor(p.x / cell)
  const cy = Math.floor(p.y / cell)
  const cz = Math.floor(p.z / cell)
  const out: string[][] = []
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let oz = -1; oz <= 1; oz++) {
        const bucket = buckets.get(cellKey(cx + ox, cy + oy, cz + oz))
        if (bucket) out.push(bucket)
      }
    }
  }
  return out
}

/**
 * Lay out group CENTRES by minimising E (see module doc) with a bounded,
 * deterministic gradient descent, then projecting the remaining overlaps away.
 * Same `groups`/`affinities`/`options` input ⇒ same output, regardless of the
 * order `groups` is given in.
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

  // Deterministic initial placement: a VOLUME, not a shell.
  //
  // The previous init put every centre at `spreadRadius · jitter` — i.e. ON a
  // sphere of constant radius. Every group therefore sat at the same distance
  // from the origin, which is why the graph read as a hollow ball with
  // unrelated groups arbitrarily far apart: nothing but the affinity springs
  // could ever bring two unconnected groups closer, and they had no reason to.
  //
  // The radius now follows cbrt(rank) (uniform density in a volume), and the
  // outer radius is the tightest sphere that can hold the envelopes at a given
  // packing fraction, so the initial cloud is already as compact as geometry
  // allows and the descent only has to arrange it.
  const totalVolume = ids.reduce((s, id) => {
    const r = radiusOf.get(id)!
    return s + (4 / 3) * Math.PI * r * r * r
  }, 0)
  const spreadRadius = Math.max(
    1,
    Math.cbrt(totalVolume / (PACKING_FRACTION * (4 / 3) * Math.PI)),
  )
  const pos = new Map<string, { x: number; y: number; z: number }>()
  ids.forEach((id, i) => {
    const rng = mulberry32(hashString(id))
    const up = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n
    const around = Math.sqrt(Math.max(0, 1 - up * up))
    const angle = GOLDEN_ANGLE * i + rng() * Math.PI * 2 * 0.05
    const r = spreadRadius * Math.cbrt((i + 0.5) / n)
    pos.set(id, {
      x: Math.cos(angle) * around * r,
      y: up * r,
      z: Math.sin(angle) * around * r,
    })
  })

  const maxRadius = ids.reduce((m, id) => Math.max(m, radiusOf.get(id)!), 0)
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
      const target = affinityTarget(radiusOf.get(g)!, radiusOf.get(h)!, a)
      const diff = dist - target
      const coeff = (LAMBDA_AFFINITY * a * 2 * diff) / dist
      // Force on g = -∇_g E = -coeff · (pg - ph)
      addForce(g, -coeff * dx, -coeff * dy, -coeff * dz)
      addForce(h, coeff * dx, coeff * dy, coeff * dz)
    }

    // (No repulsion here — see the separation projection after the loop. It
    // used to run on the same grid, rebuilt every iteration, which cost more
    // than the whole rest of the descent and never converged: the anchor term
    // pulls a group toward its neighbours' barycentre, which can lie inside a
    // third group, so a soft penalty cannot win that tug of war. Removing it
    // from the loop and enforcing separation once, by projection, is both
    // correct and an order of magnitude cheaper.)

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

  // ── Global inflation ─────────────────────────────────────────────────────
  // The descent contracts hard: with many affine neighbours every pair wants
  // 55 % of its envelope at once, which no sphere packing can satisfy (kissing
  // number). The projection then had to undo a very deep contraction locally
  // and, at 200 groups, ran out of budget with pairs still 65 px apart where
  // their envelopes need 140.
  //
  // One uniform scale about the centroid resolves EVERY violated hard distance
  // at once — a scale s multiplies all distances by s, so s = max(hard/dist)
  // makes the worst pair exactly touch. The projection is then only a local
  // clean-up, which is what it is good at.
  {
    const cell = 2 * maxRadius + OVERLAP_MARGIN
    const buckets = buildGrid(ids, pos, cell)
    let scale = 1
    for (const g of ids) {
      const pg = pos.get(g)!
      for (const bucket of neighboursOf(buckets, pg, cell)) {
        for (const h of bucket) {
          if (h <= g) continue
          const ph = pos.get(h)!
          const dist = Math.max(EPSILON, vecLen(pg.x - ph.x, pg.y - ph.y, pg.z - ph.z))
          const hard = hardDistance(radiusOf.get(g)!, radiusOf.get(h)!, affinityOf(affinities, g, h))
          if (dist < hard) scale = Math.max(scale, hard / dist)
        }
      }
    }
    if (scale > 1) {
      // Bounded: a pair that the descent put on top of each other must not
      // throw the whole graph to infinity.
      const s = Math.min(scale, MAX_INFLATION)
      let cx = 0
      let cy = 0
      let cz = 0
      for (const id of ids) {
        const p = pos.get(id)!
        cx += p.x
        cy += p.y
        cz += p.z
      }
      cx /= n
      cy /= n
      cz /= n
      for (const id of ids) {
        const p = pos.get(id)!
        pos.set(id, {
          x: cx + (p.x - cx) * s,
          y: cy + (p.y - cy) * s,
          z: cz + (p.z - cz) * s,
        })
      }
    }
  }

  // ── Separation projection ────────────────────────────────────────────────
  // The descent above leaves overlaps (see SEPARATION_ITERATIONS). This pass
  // removes them by construction: it visits the penetrating pairs in canonical
  // order and moves each apart by half the penetration, until a full pass finds
  // nothing to do or the budget is spent. Positions are read from the live map
  // (Gauss-Seidel), and every visit is deterministic, so the output stays
  // independent of the caller's array order.
  const sepCell = 2 * maxRadius + OVERLAP_MARGIN
  for (let pass = 0; pass < SEPARATION_ITERATIONS; pass++) {
    const cell = sepCell
    const buckets = buildGrid(ids, pos, cell)
    let moved = 0
    let maxPush = 0
    for (let i = 0; i < n; i++) {
      const g = ids[i]
      const pg = pos.get(g)!
      const gx = Math.floor(pg.x / cell)
      const gy = Math.floor(pg.y / cell)
      const gz = Math.floor(pg.z / cell)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const bucket = buckets.get(cellKey(gx + ox, gy + oy, gz + oz))
            if (!bucket) continue
            for (const h of bucket) {
              if (h <= g) continue
              const ph = pos.get(h)!
              const dx = pg.x - ph.x
              const dy = pg.y - ph.y
              const dz = pg.z - ph.z
              const dist = Math.max(EPSILON, vecLen(dx, dy, dz))
              const minDist = hardDistance(
                radiusOf.get(g)!,
                radiusOf.get(h)!,
                affinityOf(affinities, g, h),
              )
              const overlap = minDist - dist
              if (overlap <= 0) continue
              // Half the penetration each, along the line joining the centres.
              // A pair at exactly the same point gets a deterministic axis from
              // its own ids rather than a division by zero.
              const ux = dist > EPSILON ? dx / dist : 1
              const uy = dist > EPSILON ? dy / dist : 0
              const uz = dist > EPSILON ? dz / dist : 0
              const push = overlap * 0.75
              if (push > maxPush) maxPush = push
              pos.set(g, { x: pg.x + ux * push, y: pg.y + uy * push, z: pg.z + uz * push })
              pos.set(h, { x: ph.x - ux * push, y: ph.y - uy * push, z: ph.z - uz * push })
              moved++
            }
          }
        }
      }
    }
    // Half-penetration projection converges geometrically but never exactly:
    // it kept asking for its full budget (399 of 400 passes at 200 groups)
    // trading sub-pixel corrections. Stop once the worst remaining penetration
    // is under a pixel — invisible, and it cuts the cost by an order of
    // magnitude.
    if (moved === 0 || maxPush < SEPARATION_TOLERANCE) break
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
