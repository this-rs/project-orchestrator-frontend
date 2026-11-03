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

// ── Prepared problem: dense indices, typed arrays, sparse affinities ────────
// Everything below works on indices into the SORTED id list and on typed
// arrays. The previous version kept `Map<string, {x,y,z}>` and allocated a new
// object per move — 2 000 groups × 400 passes of allocation was most of the
// 16 s the reviewer measured.

interface Prepared {
  ids: string[]
  n: number
  radius: Float64Array
  /** Affine pairs, canonical (i < j, sorted by i then j). */
  pairI: Int32Array
  pairJ: Int32Array
  pairA: Float64Array
  /** CSR adjacency of the affine pairs: neighbours of i are adj[adjStart[i]..adjStart[i+1]). */
  adjStart: Int32Array
  adj: Int32Array
  adjA: Float64Array
  /** i·n + j (i < j) → affinity, for the contact pairs the grid finds. */
  affinityByPair: Map<number, number>
  maxRadius: number
}

/**
 * Index the problem. The affinity matrix is read SPARSELY: only the rows and
 * cells that exist are visited, never the G² pairs. Iteration order of the
 * caller's object is irrelevant — pairs are sorted by their canonical key.
 */
function prepare(
  radiusOf: Map<string, number>,
  affinities: AffinityMatrix,
): Prepared {
  const ids = [...radiusOf.keys()].sort()
  const n = ids.length
  const index = new Map<string, number>()
  ids.forEach((id, i) => index.set(id, i))
  const radius = new Float64Array(n)
  let maxRadius = 0
  for (let i = 0; i < n; i++) {
    radius[i] = radiusOf.get(ids[i])!
    if (radius[i] > maxRadius) maxRadius = radius[i]
  }

  const affinityByPair = new Map<number, number>()
  for (const g of Object.keys(affinities)) {
    const i = index.get(g)
    if (i === undefined) continue
    const row = affinities[g]
    if (!row) continue
    for (const h of Object.keys(row)) {
      const j = index.get(h)
      if (j === undefined || j === i) continue
      const a = row[h]
      if (!(a > 0) || !Number.isFinite(a)) continue
      // Symmetric: the larger of the two directions when both are given.
      const key = i < j ? i * n + j : j * n + i
      const prev = affinityByPair.get(key)
      if (prev === undefined || a > prev) affinityByPair.set(key, a)
    }
  }
  const keys = [...affinityByPair.keys()].sort((a, b) => a - b)
  const m = keys.length
  const pairI = new Int32Array(m)
  const pairJ = new Int32Array(m)
  const pairA = new Float64Array(m)
  const degree = new Int32Array(n + 1)
  for (let k = 0; k < m; k++) {
    const key = keys[k]
    const i = Math.floor(key / n)
    const j = key - i * n
    pairI[k] = i
    pairJ[k] = j
    pairA[k] = affinityByPair.get(key)!
    degree[i]++
    degree[j]++
  }
  const adjStart = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + degree[i]
  const fill = adjStart.slice(0, n)
  const adj = new Int32Array(2 * m)
  const adjA = new Float64Array(2 * m)
  for (let k = 0; k < m; k++) {
    const i = pairI[k]
    const j = pairJ[k]
    adj[fill[i]] = j
    adjA[fill[i]++] = pairA[k]
    adj[fill[j]] = i
    adjA[fill[j]++] = pairA[k]
  }
  return { ids, n, radius, pairI, pairJ, pairA, adjStart, adj, adjA, affinityByPair, maxRadius }
}

function pairAffinity(p: Prepared, i: number, j: number): number {
  return p.affinityByPair.get(i < j ? i * p.n + j : j * p.n + i) ?? 0
}

// ── Hashed uniform grid over the centres ────────────────────────────────────
// Every interaction the grid serves is exactly zero beyond
// `2·maxRadius + OVERLAP_MARGIN` (a contact does not exist between envelopes
// that do not touch), so with that cell size a query only examines the 27
// neighbouring cells. The cells are hashed into a power-of-two table of
// linked lists held in two Int32Arrays: no Map, no string, no allocation per
// rebuild. Two cells that share a slot only cost extra distance checks — the
// distance test is exact either way.

interface Grid {
  cell: number
  mask: number
  head: Int32Array
  next: Int32Array
  slots: Int32Array
}

function makeGrid(n: number, cell: number): Grid {
  let size = 16
  while (size < 2 * n) size <<= 1
  return { cell, mask: size - 1, head: new Int32Array(size), next: new Int32Array(n), slots: new Int32Array(27) }
}

function slotOf(g: Grid, cx: number, cy: number, cz: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) & g.mask
}

function fillGrid(g: Grid, n: number, x: Float64Array, y: Float64Array, z: Float64Array): void {
  g.head.fill(-1)
  // Descending insert → every chain lists its indices in ascending order, so
  // the visit order is a function of the positions only.
  for (let i = n - 1; i >= 0; i--) {
    const s = slotOf(g, Math.floor(x[i] / g.cell), Math.floor(y[i] / g.cell), Math.floor(z[i] / g.cell))
    g.next[i] = g.head[s]
    g.head[s] = i
  }
}

/** The distinct slots around a point, written into `g.slots`; returns their count. */
function slotsAround(g: Grid, px: number, py: number, pz: number): number {
  const cx = Math.floor(px / g.cell)
  const cy = Math.floor(py / g.cell)
  const cz = Math.floor(pz / g.cell)
  let count = 0
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let oz = -1; oz <= 1; oz++) {
        const s = slotOf(g, cx + ox, cy + oy, cz + oz)
        let seen = false
        for (let k = 0; k < count; k++) {
          if (g.slots[k] === s) {
            seen = true
            break
          }
        }
        if (!seen) g.slots[count++] = s
      }
    }
  }
  return count
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
  const p = prepare(new Map(groups.map((g) => [g.id, g.radius])), affinities)
  const { ids, n, radius, pairI, pairJ, pairA, adjStart, adj, adjA } = p

  // Deterministic initial placement: a VOLUME, not a shell.
  //
  // The previous init put every centre at `spreadRadius · jitter` — i.e. ON a
  // sphere of constant radius. Every group therefore sat at the same distance
  // from the origin, which is why the graph read as a hollow ball with
  // unrelated groups arbitrarily far apart.
  //
  // The radius now follows cbrt(rank) (uniform density in a volume), and the
  // outer radius is the tightest sphere that can hold the envelopes at a given
  // packing fraction.
  let totalVolume = 0
  for (let i = 0; i < n; i++) totalVolume += (4 / 3) * Math.PI * radius[i] ** 3
  const spreadRadius = Math.max(1, Math.cbrt(totalVolume / (PACKING_FRACTION * (4 / 3) * Math.PI)))
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const z = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(hashString(ids[i]))
    const up = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n
    const around = Math.sqrt(Math.max(0, 1 - up * up))
    const angle = GOLDEN_ANGLE * i + rng() * Math.PI * 2 * 0.05
    const r = spreadRadius * Math.cbrt((i + 0.5) / n)
    x[i] = Math.cos(angle) * around * r
    y[i] = up * r
    z[i] = Math.sin(angle) * around * r
  }

  const prevX = new Float64Array(n)
  const prevY = new Float64Array(n)
  const prevZ = new Float64Array(n)
  const hasPrev = new Uint8Array(n)
  if (previous) {
    for (let i = 0; i < n; i++) {
      const q = previous.get(ids[i])
      if (!q) continue
      hasPrev[i] = 1
      prevX[i] = q.x
      prevY[i] = q.y
      prevZ[i] = q.z
    }
  }

  const fx = new Float64Array(n)
  const fy = new Float64Array(n)
  const fz = new Float64Array(n)
  for (let iter = 0; iter < maxIterations; iter++) {
    fx.fill(0)
    fy.fill(0)
    fz.fill(0)

    // E_affinity: spring toward the affinity-scaled target distance.
    for (let k = 0; k < pairI.length; k++) {
      const g = pairI[k]
      const h = pairJ[k]
      const a = pairA[k]
      const dx = x[g] - x[h]
      const dy = y[g] - y[h]
      const dz = z[g] - z[h]
      const dist = Math.max(EPSILON, vecLen(dx, dy, dz))
      const target = affinityTarget(radius[g], radius[h], a)
      const coeff = (LAMBDA_AFFINITY * a * 2 * (dist - target)) / dist
      // Force on g = -∇_g E = -coeff · (pg - ph)
      fx[g] -= coeff * dx
      fy[g] -= coeff * dy
      fz[g] -= coeff * dz
      fx[h] += coeff * dx
      fy[h] += coeff * dy
      fz[h] += coeff * dz
    }

    // E_stability: spring toward the previous position, when supplied.
    if (previous) {
      for (let i = 0; i < n; i++) {
        if (!hasPrev[i]) continue
        fx[i] -= 2 * LAMBDA_STABILITY * (x[i] - prevX[i])
        fy[i] -= 2 * LAMBDA_STABILITY * (y[i] - prevY[i])
        fz[i] -= 2 * LAMBDA_STABILITY * (z[i] - prevZ[i])
      }
    }

    // E_anchor: spring toward the affinity-weighted barycenter of REAL
    // neighbours only — isolated groups (no neighbours) get no anchor force.
    for (let i = 0; i < n; i++) {
      const from = adjStart[i]
      const to = adjStart[i + 1]
      if (from === to) continue
      let wx = 0
      let wy = 0
      let wz = 0
      let wsum = 0
      for (let k = from; k < to; k++) {
        const h = adj[k]
        const a = adjA[k]
        wx += x[h] * a
        wy += y[h] * a
        wz += z[h] * a
        wsum += a
      }
      if (wsum <= 0) continue
      fx[i] -= 2 * LAMBDA_ANCHOR * (x[i] - wx / wsum)
      fy[i] -= 2 * LAMBDA_ANCHOR * (y[i] - wy / wsum)
      fz[i] -= 2 * LAMBDA_ANCHOR * (z[i] - wz / wsum)
    }

    // Synchronous apply: every move uses the SAME snapshot of positions that
    // produced every force above, so the result never depends on id order.
    const lr = LEARNING_RATE_0 * (1 - iter / maxIterations)
    for (let i = 0; i < n; i++) {
      let dx = lr * fx[i]
      let dy = lr * fy[i]
      let dz = lr * fz[i]
      const mag = vecLen(dx, dy, dz)
      if (mag > MAX_STEP) {
        const scale = MAX_STEP / mag
        dx *= scale
        dy *= scale
        dz *= scale
      }
      x[i] += dx
      y[i] += dy
      z[i] += dz
    }
  }

  const grid = makeGrid(n, 2 * p.maxRadius + OVERLAP_MARGIN)

  // ── Global inflation ─────────────────────────────────────────────────────
  // One uniform scale about the centroid resolves EVERY violated hard distance
  // at once — a scale s multiplies all distances by s, so s = max(hard/dist)
  // makes the worst pair exactly touch. The projection is then only a local
  // clean-up.
  {
    fillGrid(grid, n, x, y, z)
    let scale = 1
    for (let i = 0; i < n; i++) {
      const count = slotsAround(grid, x[i], y[i], z[i])
      for (let s = 0; s < count; s++) {
        for (let j = grid.head[grid.slots[s]]; j !== -1; j = grid.next[j]) {
          if (j <= i) continue
          const dist = Math.max(EPSILON, vecLen(x[i] - x[j], y[i] - y[j], z[i] - z[j]))
          const hard = hardDistance(radius[i], radius[j], pairAffinity(p, i, j))
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
      for (let i = 0; i < n; i++) {
        cx += x[i]
        cy += y[i]
        cz += z[i]
      }
      cx /= n
      cy /= n
      cz /= n
      for (let i = 0; i < n; i++) {
        x[i] = cx + (x[i] - cx) * s
        y[i] = cy + (y[i] - cy) * s
        z[i] = cz + (z[i] - cz) * s
      }
    }
  }

  separate(p, x, y, z, grid, SEPARATION_ITERATIONS)

  for (let i = 0; i < n; i++) {
    result.set(ids[i], {
      x: Number.isFinite(x[i]) ? x[i] : 0,
      y: Number.isFinite(y[i]) ? y[i] : 0,
      z: Number.isFinite(z[i]) ? z[i] : 0,
    })
  }
  return result
}

/**
 * Separation projection on the prepared arrays. Visits the penetrating pairs
 * (found through the grid, never all n² pairs) in index order and moves each
 * apart, reading and writing the live arrays (Gauss-Seidel): a group pressed by
 * several neighbours in one pass accumulates every push. Deterministic: the
 * visit order is a function of the indices and positions only. Returns the
 * number of passes run.
 */
function separate(
  p: Prepared,
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  grid: Grid,
  maxPasses: number,
): number {
  const { n, radius } = p
  let pass = 0
  for (; pass < maxPasses; pass++) {
    fillGrid(grid, n, x, y, z)
    let moved = 0
    let maxPush = 0
    for (let i = 0; i < n; i++) {
      const count = slotsAround(grid, x[i], y[i], z[i])
      for (let s = 0; s < count; s++) {
        for (let j = grid.head[grid.slots[s]]; j !== -1; j = grid.next[j]) {
          if (j <= i) continue
          const dx = x[i] - x[j]
          const dy = y[i] - y[j]
          const dz = z[i] - z[j]
          const d2 = dx * dx + dy * dy + dz * dz
          const reach = radius[i] + radius[j] + OVERLAP_MARGIN
          // Cheap reject first: no pair farther than the envelope sum can be
          // in contact, whatever its affinity.
          if (d2 >= reach * reach) continue
          const dist = Math.max(EPSILON, Math.sqrt(d2))
          const overlap = hardDistance(radius[i], radius[j], pairAffinity(p, i, j)) - dist
          if (overlap <= 0) continue
          // Along the line joining the centres. A pair at exactly the same
          // point gets a deterministic axis rather than a division by zero.
          const ux = dist > EPSILON ? dx / dist : 1
          const uy = dist > EPSILON ? dy / dist : 0
          const uz = dist > EPSILON ? dz / dist : 0
          const push = overlap * 0.75
          if (push > maxPush) maxPush = push
          x[i] += ux * push
          y[i] += uy * push
          z[i] += uz * push
          x[j] -= ux * push
          y[j] -= uy * push
          z[j] -= uz * push
          moved++
        }
      }
    }
    // Converges geometrically but never exactly: stop once a whole pass moves
    // nothing by more than SEPARATION_TOLERANCE — invisible.
    if (moved === 0 || maxPush < SEPARATION_TOLERANCE) return pass + 1
  }
  return pass
}

/**
 * Separation projection on caller-held positions, exported for its own tests.
 * Same contract as the pass `layoutGroups` runs: unrelated envelopes never
 * overlap, related groups keep their cores apart. `pos` is updated in place.
 * Returns the number of passes it ran.
 */
export function separateGroups(
  ids: string[],
  pos: Map<string, OrganicPoint>,
  radiusOf: Map<string, number>,
  affinities: AffinityMatrix,
  maxPasses: number = SEPARATION_ITERATIONS,
): number {
  const radii = new Map(ids.map((id) => [id, radiusOf.get(id)!]))
  const p = prepare(radii, affinities)
  const x = new Float64Array(p.n)
  const y = new Float64Array(p.n)
  const z = new Float64Array(p.n)
  p.ids.forEach((id, i) => {
    const q = pos.get(id)!
    x[i] = q.x
    y[i] = q.y
    z[i] = q.z
  })
  const passes = separate(p, x, y, z, makeGrid(p.n, 2 * p.maxRadius + OVERLAP_MARGIN), maxPasses)
  p.ids.forEach((id, i) => pos.set(id, { x: x[i], y: y[i], z: z[i] }))
  return passes
}
