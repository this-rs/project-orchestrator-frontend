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
// CONSTRUCTIVE (see "Constructive initial placement"): each component of the
// affinity graph is grown relation by relation, every group at the free spot
// nearest to its placed neighbours, then the components are packed in shells.
// The start is already compact and free of overlap; the descent refines it.
//
// ── Separation ───────────────────────────────────────────────────────────────
// Contact is resolved during the descent (one Jacobi sweep every
// CONTACT_EVERY iterations) and once more after it by a position-based
// projection that visits the penetrating pairs (found through a uniform grid,
// never all n² pairs) and moves each apart, repeating until a pass finds
// nothing to do or SEPARATION_ITERATIONS is spent. The distance both enforce
// is `hardDistance`: envelope for unrelated groups, core for related ones.
// There is no global inflation any more.
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
  /**
   * Centres that must not move: groups already on screen when new ones
   * arrive. They are returned unchanged; the other groups are placed around
   * them (next to their related fixed groups, else just outside the scene)
   * and pushed off them, never the reverse.
   */
  fixedPositions?: Map<string, OrganicPoint>
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
/**
 * Espace clair entre deux enveloppes NON LIÉES, en part de leur somme.
 *
 * Historique : à 0 les groupes se touchaient (1,01× la somme des rayons) ; 5 %
 * ont ajouté une couture visible sans desserrer le nuage. Mais à l'usage (05/11) le
 * nuage reste « toujours trop rapproché » : deux groupes sans lien restaient à
 * 1,05× — collés à l'échelle de l'écran, et la vue ne pouvait pas s'éclater.
 *
 * 45 % : deux ensembles non liés se lisent comme deux objets distincts, avec du vide
 * entre eux. C'est le seul levier qui éclate la disposition — les liens, eux, gardent
 * leur distance d'affinité (ils doivent rester proches pour se lire).
 */
const UNRELATED_CLEARANCE = 0.45

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

/**
 * Share of a contact's penetration removed per contact sweep of the descent.
 *
 * The descent used to run with no contact at all: related groups were pulled
 * THROUGH the others into a deep pile that one global inflation then had to
 * undo. That inflation took the worst pair's ratio, so it always hit its ×4
 * cap and the final cloud was 3.45× the compact sphere, unrelated neighbours
 * 1.6–2.2× their envelope apart. Contact is now resolved as the descent goes.
 * Jacobi-style (from one snapshot, like the forces): a group pressed on
 * several sides sums several pushes, so the share stays well under 1 and the
 * sum is clamped like a step.
 */
const CONTACT_RELAXATION = 0.5
/**
 * Descent iterations between two contact sweeps. A sweep is the descent's
 * only grid pass and costs more than everything else in an iteration
 * (measured: 0.7 ms against < 0.1 ms at 801 groups); the springs move little
 * between two sweeps, so every other iteration is enough.
 */
const CONTACT_EVERY = 2

/**
 * Share of the way to its local equilibrium a group moves per step, decaying
 * linearly to 0 across the iteration budget. A step is force / stiffness
 * (see `stiffness` in layoutGroups); 0.5 would close a lone pair's gap in
 * one step from both ends, so anything below it never overshoots.
 */
const STEP_FRACTION_0 = 0.45
/** Per-step displacement clamp (px) — keeps the descent from ever exploding. */
const MAX_STEP = 24

/** Minimum distance used in direction/force maths — avoids division by zero
 *  when two centres land exactly on top of each other. */
const EPSILON = 1e-6

const GOLDEN_ANGLE = 2.39996


function vecLen(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z)
}

/** The distance two centres may never fall below. Unrelated groups: their
 *  envelopes never touch. Related groups: their cores never touch, their halos
 *  may interpenetrate — that is how a relation reads at a glance. */
function hardDistance(rg: number, rh: number, affinity: number): number {
  const envelope = rg + rh
  if (affinity <= 0) return envelope * (1 + UNRELATED_CLEARANCE) + OVERLAP_MARGIN
  return envelope * CORE_RATIO + OVERLAP_MARGIN
}

/** The largest hard distance any pair of this problem can have: the grid cell. */
function maxHardDistance(p: Prepared): number {
  return 2 * p.maxRadius * (1 + UNRELATED_CLEARANCE) + OVERLAP_MARGIN
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
  /** 1 for a group whose centre is given and must not move (`fixedPositions`). */
  fixed: Uint8Array
  radius: Float64Array
  /** Affine pairs, canonical (i < j, sorted by i then j). */
  pairI: Int32Array
  pairJ: Int32Array
  pairA: Float64Array
  /** CSR adjacency of the affine pairs: neighbours of i are adj[adjStart[i]..adjStart[i+1]). */
  adjStart: Int32Array
  adj: Int32Array
  adjA: Float64Array
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
  return { ids, n, fixed: new Uint8Array(n), radius, pairI, pairJ, pairA, adjStart, adj, adjA, maxRadius }
}

/** Affinity of a pair, 0 when unrelated. A binary search in i's neighbour
 *  list (ascending by construction) — no hash lookup on the contact path. */
function pairAffinity(p: Prepared, i: number, j: number): number {
  let lo = p.adjStart[i]
  let hi = p.adjStart[i + 1] - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = p.adj[mid]
    if (v === j) return p.adjA[mid]
    if (v < j) lo = mid + 1
    else hi = mid - 1
  }
  return 0
}

// ── Hashed uniform grid over the centres ────────────────────────────────────
// Every interaction the grid serves is exactly zero beyond
// `maxHardDistance` (a contact does not exist between envelopes
// that do not touch), so with that cell size a query only examines the 27
// neighbouring cells. Cells index a flat table of linked lists held in
// Int32Arrays: no Map, no string, no allocation per rebuild. A compact cloud
// (the normal case) is indexed DIRECTLY by its bounding box of cells; a cloud
// too sparse for that falls back to hashing the cells into a power-of-two
// table, where two cells sharing a slot are told apart by their coordinates.

interface Grid {
  cell: number
  head: Int32Array
  next: Int32Array
  /** The cell of every centre at the last fill. */
  cx: Int32Array
  cy: Int32Array
  cz: Int32Array
  direct: boolean
  mask: number
  minX: number
  minY: number
  minZ: number
  dimX: number
  dimY: number
  dimZ: number
}

/**
 * The cell itself, then the 13 neighbours that come after it in
 * lexicographic order: every pair of adjacent cells is visited from exactly
 * one side, so a sweep checks each pair once and looks at 14 cells, not 27.
 */
const HALF_SHELL = (() => {
  const out: number[] = [0, 0, 0]
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let oz = -1; oz <= 1; oz++) {
        if (ox > 0 || (ox === 0 && (oy > 0 || (oy === 0 && oz > 0)))) out.push(ox, oy, oz)
      }
    }
  }
  return Int32Array.from(out)
})()

function makeGrid(n: number, cell: number): Grid {
  return {
    cell,
    head: new Int32Array(16),
    next: new Int32Array(n),
    cx: new Int32Array(n),
    cy: new Int32Array(n),
    cz: new Int32Array(n),
    direct: true,
    mask: 15,
    minX: 0,
    minY: 0,
    minZ: 0,
    dimX: 0,
    dimY: 0,
    dimZ: 0,
  }
}

/** Slot of a cell, -1 when a direct grid has no such cell. */
function slotOf(g: Grid, cx: number, cy: number, cz: number): number {
  if (g.direct) {
    const ix = cx - g.minX
    const iy = cy - g.minY
    const iz = cz - g.minZ
    if (ix < 0 || iy < 0 || iz < 0 || ix >= g.dimX || iy >= g.dimY || iz >= g.dimZ) return -1
    return (ix * g.dimY + iy) * g.dimZ + iz
  }
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) & g.mask
}

function fillGrid(g: Grid, n: number, x: Float64Array, y: Float64Array, z: Float64Array): void {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(x[i] / g.cell)
    const cy = Math.floor(y[i] / g.cell)
    const cz = Math.floor(z[i] / g.cell)
    g.cx[i] = cx
    g.cy[i] = cy
    g.cz[i] = cz
    if (cx < minX) minX = cx
    if (cy < minY) minY = cy
    if (cz < minZ) minZ = cz
    if (cx > maxX) maxX = cx
    if (cy > maxY) maxY = cy
    if (cz > maxZ) maxZ = cz
  }
  const cells = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1)
  g.direct = Number.isFinite(cells) && cells <= Math.max(4096, 8 * n)
  let size: number
  if (g.direct) {
    g.minX = minX
    g.minY = minY
    g.minZ = minZ
    g.dimX = maxX - minX + 1
    g.dimY = maxY - minY + 1
    g.dimZ = maxZ - minZ + 1
    size = cells
  } else {
    size = 16
    while (size < 2 * n) size <<= 1
    g.mask = size - 1
  }
  if (g.head.length < size) g.head = new Int32Array(size)
  g.head.fill(-1, 0, size)
  // Descending insert → every chain lists its indices in ascending order, so
  // the visit order is a function of the positions only.
  for (let i = n - 1; i >= 0; i--) {
    const s = slotOf(g, g.cx[i], g.cy[i], g.cz[i])
    g.next[i] = g.head[s]
    g.head[s] = i
  }
}

/**
 * One sweep over every pair in contact (i < j, cells adjacent, centres closer
 * than their hard distance).
 *
 * `live` (Gauss-Seidel): each push is applied at once, so a group pressed on
 * several sides accumulates every push of the sweep. Used by the final
 * projection.
 * not `live` (Jacobi): pushes are summed from the snapshot the grid was filled
 * from, scaled by `relax`, and applied at the end — the result is then
 * independent of the visit order. Used inside the descent.
 *
 * Returns the largest single push, 0 when nothing was in contact.
 */
function contactSweep(
  p: Prepared,
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  grid: Grid,
  live: boolean,
  relax: number,
  bx: Float64Array,
  by: Float64Array,
  bz: Float64Array,
): number {
  const { n, radius, fixed } = p
  fillGrid(grid, n, x, y, z)
  if (!live) {
    bx.fill(0)
    by.fill(0)
    bz.fill(0)
  }
  let maxPush = 0
  for (let i = 0; i < n; i++) {
    const ci = grid.cx[i]
    const cj = grid.cy[i]
    const ck = grid.cz[i]
    for (let o = 0; o < HALF_SHELL.length; o += 3) {
      const tx = ci + HALF_SHELL[o]
      const ty = cj + HALF_SHELL[o + 1]
      const tz = ck + HALF_SHELL[o + 2]
      const slot = slotOf(grid, tx, ty, tz)
      if (slot < 0) continue
      for (let j = grid.head[slot]; j !== -1; j = grid.next[j]) {
        if (o === 0 && j <= i) continue
        if (!grid.direct && (grid.cx[j] !== tx || grid.cy[j] !== ty || grid.cz[j] !== tz)) continue
        const dx = x[i] - x[j]
        const dy = y[i] - y[j]
        const dz = z[i] - z[j]
        const d2 = dx * dx + dy * dy + dz * dz
        const reach = (radius[i] + radius[j]) * (1 + UNRELATED_CLEARANCE) + OVERLAP_MARGIN
        // Cheap reject first: no pair farther than the envelope sum can be
        // in contact, whatever its affinity.
        if (d2 >= reach * reach) continue
        const dist = Math.sqrt(d2)
        const overlap = hardDistance(radius[i], radius[j], pairAffinity(p, i, j)) - dist
        if (overlap <= 0) continue
        // Along the line joining the centres. A pair at exactly the same
        // point gets a deterministic axis rather than a division by zero.
        const ux = dist > EPSILON ? dx / dist : 1
        const uy = dist > EPSILON ? dy / dist : 0
        const uz = dist > EPSILON ? dz / dist : 0
        // A fixed group does not move: the other one takes the whole push.
        const fi = fixed[i]
        const fj = fixed[j]
        if (fi && fj) continue
        const push = overlap * relax
        if (push > maxPush) maxPush = push
        const pi = fi ? 0 : fj ? 2 * push : push
        const pj = fj ? 0 : fi ? 2 * push : push
        if (live) {
          x[i] += ux * pi
          y[i] += uy * pi
          z[i] += uz * pi
          x[j] -= ux * pj
          y[j] -= uy * pj
          z[j] -= uz * pj
        } else {
          bx[i] += ux * pi
          by[i] += uy * pi
          bz[i] += uz * pi
          bx[j] -= ux * pj
          by[j] -= uy * pj
          bz[j] -= uz * pj
        }
      }
    }
  }
  if (!live) {
    for (let i = 0; i < n; i++) {
      // Bounded like a descent step: a group buried in a pile sums many
      // pushes, and unbounded they shot it across the scene (measured: a
      // cloud 6× the compact sphere on random relations).
      const mag = vecLen(bx[i], by[i], bz[i])
      const k = mag > MAX_STEP ? MAX_STEP / mag : 1
      x[i] += bx[i] * k
      y[i] += by[i] * k
      z[i] += bz[i] * k
    }
  }
  return maxPush
}

// ── Constructive initial placement ──────────────────────────────────────────
// The descent only refines; where a group STARTS decides which groups it can
// ever end up next to. A volume spiral (the previous start) scattered related
// groups across the cloud, so their springs had to drag them through the
// others: without contact they collapsed into a pile that a global inflation
// had to undo (×4, every time), and with contact they jammed far apart.
//
// 1. Each connected component of the affinity graph is BUILT on its own, in
//    breadth-first order (heaviest hub first, strongest relation first): a
//    group goes to the free spot nearest to the weighted barycentre of its
//    already-placed neighbours. "Free" means at least the rest distance from
//    every placed group — the affinity target for a related pair, the
//    envelope sum (+ margin) otherwise. Candidates lie on RAY_DIRECTION_COUNT
//    rays from that target; on each ray the first free distance is exact,
//    from the intervals the placed spheres cut on it. Among the rays the
//    nearest wins, slightly biased toward the component's centroid so it
//    grows as a ball, not a snake.
// 2. The components (an isolated group is a component of one) are then packed
//    as balls, largest first, shell after shell around the first one.
//
// Both steps are bounded: a search looks once, in a fixed neighbourhood, and
// a group whose neighbours are buried too deep for it (random relations no 3D
// layout can keep local) goes to its target overlapping and is left to the
// descent's contact pass — never an O(n) scan per group.

/** Rays tried around a target. */
const RAY_DIRECTION_COUNT = 24
/** Weight of "near the centroid" against "near the target" when choosing a ray. */
const COMPACTNESS = 0.3
/** Share of a shell's area the packed balls may cover. Discs on a sphere
 *  cannot pass ~0.9; under it, a shell of mixed sizes still closes. */
const SHELL_FILL = 0.7

const RAY_DIRECTIONS = (() => {
  const out = new Float64Array(RAY_DIRECTION_COUNT * 3)
  for (let k = 0; k < RAY_DIRECTION_COUNT; k++) {
    const up = 1 - (2 * (k + 0.5)) / RAY_DIRECTION_COUNT
    const around = Math.sqrt(Math.max(0, 1 - up * up))
    const angle = GOLDEN_ANGLE * k
    out[3 * k] = Math.cos(angle) * around
    out[3 * k + 1] = up
    out[3 * k + 2] = Math.sin(angle) * around
  }
  return out
})()

/** Rest distance of a pair at construction: where its own forces would leave it. */
function restDistance(rg: number, rh: number, a: number): number {
  return a > 0 ? affinityTarget(rg, rh, a) : hardDistance(rg, rh, 0)
}

/**
 * Breadth-first order of the affinity graph, heaviest hub of each component
 * first. `start[c]..start[c+1]` delimits component c in the returned order.
 */
function components(p: Prepared): { order: Int32Array; start: number[] } {
  const { n, adjStart, adj, adjA } = p
  const weight = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    for (let k = adjStart[i]; k < adjStart[i + 1]; k++) weight[i] += adjA[k]
  }
  const seeds = Array.from({ length: n }, (_, i) => i).sort((a, b) => weight[b] - weight[a] || a - b)
  const visited = new Uint8Array(n)
  const order = new Int32Array(n)
  const start: number[] = []
  let len = 0
  const nbrs: number[] = []
  for (const seed of seeds) {
    if (visited[seed]) continue
    start.push(len)
    visited[seed] = 1
    let head = len
    order[len++] = seed
    while (head < len) {
      const g = order[head++]
      nbrs.length = 0
      for (let k = adjStart[g]; k < adjStart[g + 1]; k++) if (!visited[adj[k]]) nbrs.push(k)
      nbrs.sort((ka, kb) => adjA[kb] - adjA[ka] || adj[ka] - adj[kb])
      for (const k of nbrs) {
        visited[adj[k]] = 1
        order[len++] = adj[k]
      }
    }
  }
  start.push(len)
  return { order, start }
}

/** Obstacle grid of the construction: exact cell keys, grown one group at a time. */
class PlacementGrid {
  private readonly cells = new Map<number, number[]>()
  constructor(readonly cell: number) {}
  private static key(cx: number, cy: number, cz: number): number {
    // Exact (collision-free) for |cell index| < 2^20 — far beyond any cloud.
    const o = 1 << 20
    return ((cx + o) * 2 ** 21 + (cy + o)) * 2 ** 21 + (cz + o)
  }
  insert(i: number, px: number, py: number, pz: number): void {
    const k = PlacementGrid.key(Math.floor(px / this.cell), Math.floor(py / this.cell), Math.floor(pz / this.cell))
    const bucket = this.cells.get(k)
    if (bucket) bucket.push(i)
    else this.cells.set(k, [i])
  }
  /** Every inserted index whose cell meets the cube of half-side `reach` around (px, py, pz). */
  forEachNear(px: number, py: number, pz: number, reach: number, visit: (h: number) => void): void {
    const c = this.cell
    const x1 = Math.floor((px + reach) / c)
    const y1 = Math.floor((py + reach) / c)
    const z1 = Math.floor((pz + reach) / c)
    for (let ix = Math.floor((px - reach) / c); ix <= x1; ix++) {
      for (let iy = Math.floor((py - reach) / c); iy <= y1; iy++) {
        for (let iz = Math.floor((pz - reach) / c); iz <= z1; iz++) {
          const bucket = this.cells.get(PlacementGrid.key(ix, iy, iz))
          if (bucket) for (const h of bucket) visit(h)
        }
      }
    }
  }
}

/**
 * The free spot nearest to (tx, ty, tz) for group g among the groups in
 * `grid`, or null when there is none within one search neighbourhood.
 */
function nearestFreeSpot(
  p: Prepared,
  g: number,
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  grid: PlacementGrid,
  tx: number,
  ty: number,
  tz: number,
  cx: number,
  cy: number,
  cz: number,
  scratch: { v: Float64Array; t0: Float64Array; t1: Float64Array },
): OrganicPoint | null {
  const restMax = maxHardDistance(p)
  // A point at distance t from the target is provably free of every group
  // outside the cube when t ≤ reach − restMax.
  const reach = 2 * restMax
  const accept = reach - restMax
  let m = 0
  grid.forEachNear(tx, ty, tz, reach, (h) => {
    const vx = x[h] - tx
    const vy = y[h] - ty
    const vz = z[h] - tz
    const rest = restDistance(p.radius[g], p.radius[h], pairAffinity(p, g, h))
    // An obstacle that only starts beyond the farthest acceptable point
    // cannot change the answer.
    const lead = accept + rest
    if (vx * vx + vy * vy + vz * vz >= lead * lead) return
    if (4 * (m + 1) > scratch.v.length) {
      const grown = new Float64Array(scratch.v.length * 2)
      grown.set(scratch.v)
      scratch.v = grown
      scratch.t0 = new Float64Array(grown.length / 4)
      scratch.t1 = new Float64Array(grown.length / 4)
    }
    scratch.v[4 * m] = vx
    scratch.v[4 * m + 1] = vy
    scratch.v[4 * m + 2] = vz
    scratch.v[4 * m + 3] = rest
    m++
  })
  const { v, t0: t0s, t1: t1s } = scratch
  let best = Infinity
  let spot: OrganicPoint | null = null
  for (let r = 0; r < RAY_DIRECTION_COUNT; r++) {
    const dx = RAY_DIRECTIONS[3 * r]
    const dy = RAY_DIRECTIONS[3 * r + 1]
    const dz = RAY_DIRECTIONS[3 * r + 2]
    // The interval [t0, t1] each obstacle cuts on the ray, kept sorted by t0.
    let k = 0
    for (let o = 0; o < m; o++) {
      const vx = v[4 * o]
      const vy = v[4 * o + 1]
      const vz = v[4 * o + 2]
      const rest = v[4 * o + 3]
      const b = dx * vx + dy * vy + dz * vz
      const disc = b * b - (vx * vx + vy * vy + vz * vz - rest * rest)
      if (disc <= 0) continue
      const s = Math.sqrt(disc)
      const t1 = b + s
      if (t1 <= 0) continue
      const t0 = Math.max(0, b - s)
      let at = k++
      while (at > 0 && t0s[at - 1] > t0) {
        t0s[at] = t0s[at - 1]
        t1s[at] = t1s[at - 1]
        at--
      }
      t0s[at] = t0
      t1s[at] = t1
    }
    let t = 0
    for (let o = 0; o < k && t0s[o] <= t; o++) if (t1s[o] > t) t = t1s[o]
    if (t > accept) continue
    const px = tx + dx * t
    const py = ty + dy * t
    const pz = tz + dz * t
    const score = t + COMPACTNESS * vecLen(px - cx, py - cy, pz - cz)
    if (score < best) {
      best = score
      spot = { x: px, y: py, z: pz }
    }
  }
  return spot
}

/** Build one component (order[from..to)) around the origin. Returns its bounding radius. */
function buildComponent(
  p: Prepared,
  order: Int32Array,
  from: number,
  to: number,
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  placed: Uint8Array,
  scratch: { v: Float64Array; t0: Float64Array; t1: Float64Array },
): number {
  const { radius, adjStart, adj, adjA } = p
  const g0 = order[from]
  x[g0] = 0
  y[g0] = 0
  z[g0] = 0
  placed[g0] = 1
  if (to - from === 1) return radius[g0]
  const grid = new PlacementGrid(maxHardDistance(p))
  grid.insert(g0, 0, 0, 0)
  let sx = 0
  let sy = 0
  let sz = 0
  let count = 1
  for (let q = from + 1; q < to; q++) {
    const g = order[q]
    // Breadth-first: at least one neighbour is already placed.
    let tx = 0
    let ty = 0
    let tz = 0
    let wsum = 0
    for (let k = adjStart[g]; k < adjStart[g + 1]; k++) {
      const h = adj[k]
      if (!placed[h]) continue
      tx += x[h] * adjA[k]
      ty += y[h] * adjA[k]
      tz += z[h] * adjA[k]
      wsum += adjA[k]
    }
    tx /= wsum
    ty /= wsum
    tz /= wsum
    const spot = nearestFreeSpot(p, g, x, y, z, grid, tx, ty, tz, sx / count, sy / count, sz / count, scratch)
    if (spot) {
      x[g] = spot.x
      y[g] = spot.y
      z[g] = spot.z
      grid.insert(g, spot.x, spot.y, spot.z)
    } else {
      // Buried: to its target, nudged off it along a ray of its own so two
      // buried groups never coincide, and kept out of the obstacle grid — or
      // every later search around it would scan a growing pile.
      const o = 3 * (g % RAY_DIRECTION_COUNT)
      x[g] = tx + RAY_DIRECTIONS[o] * radius[g]
      y[g] = ty + RAY_DIRECTIONS[o + 1] * radius[g]
      z[g] = tz + RAY_DIRECTIONS[o + 2] * radius[g]
    }
    placed[g] = 1
    sx += x[g]
    sy += y[g]
    sz += z[g]
    count++
  }
  // Recentre on the centroid, so the bounding ball is tight.
  const mx = sx / count
  const my = sy / count
  const mz = sz / count
  let bound = 0
  for (let q = from; q < to; q++) {
    const g = order[q]
    x[g] -= mx
    y[g] -= my
    z[g] -= mz
    bound = Math.max(bound, vecLen(x[g], y[g], z[g]) + radius[g])
  }
  return bound
}

/**
 * Pack the balls `comps` (component index → bound) shell after shell around
 * `centre`, from radius `outer`; with `firstAtCentre`, the largest one takes
 * the centre itself. Writes each component's offset.
 */
function packShells(
  comps: number[],
  bound: Float64Array,
  centre: OrganicPoint,
  outer: number,
  firstAtCentre: boolean,
  off: { x: Float64Array; y: Float64Array; z: Float64Array },
): void {
  let q = 0
  if (firstAtCentre && comps.length > 0) {
    off.x[comps[0]] = centre.x
    off.y[comps[0]] = centre.y
    off.z[comps[0]] = centre.z
    outer = bound[comps[0]]
    q = 1
  }
  while (q < comps.length) {
    // One shell: its balls are the next ones in size order, so they are all
    // at most as big as the first; it sits right outside the previous one.
    const r = bound[comps[q]]
    const rho = outer + r + OVERLAP_MARGIN
    const capacity = Math.max(1, Math.floor((SHELL_FILL * 4 * rho * rho) / (r * r)))
    const inShell = Math.min(capacity, comps.length - q)
    for (let k = 0; k < inShell; k++) {
      const c = comps[q + k]
      const up = inShell === 1 ? 1 : 1 - (2 * (k + 0.5)) / inShell
      const around = Math.sqrt(Math.max(0, 1 - up * up))
      const angle = GOLDEN_ANGLE * k
      off.x[c] = centre.x + Math.cos(angle) * around * rho
      off.y[c] = centre.y + up * rho
      off.z[c] = centre.z + Math.sin(angle) * around * rho
    }
    q += inShell
    outer = rho + r
  }
}

/**
 * Initial centres. Without fixed groups: every component built on its own,
 * then the components packed in shells. With fixed groups (already on screen,
 * `p.fixed`): a component that holds one grows around it in the scene's own
 * frame, every new group at the free spot nearest to its placed neighbours
 * (or to its component's fixed groups); the components that touch nothing
 * fixed are built on their own and packed in shells just outside the scene —
 * never laid out as a second archipelago over the first.
 */
function constructPlacement(p: Prepared, x: Float64Array, y: Float64Array, z: Float64Array): void {
  const { order, start } = components(p)
  const { fixed, radius, adjStart, adj, adjA } = p
  const placed = new Uint8Array(p.n)
  const scratch = { v: new Float64Array(256), t0: new Float64Array(64), t1: new Float64Array(64) }
  const count = start.length - 1

  let fixedCount = 0
  let sx = 0
  let sy = 0
  let sz = 0
  const grid = new PlacementGrid(maxHardDistance(p))
  for (let i = 0; i < p.n; i++) {
    if (!fixed[i]) continue
    placed[i] = 1
    grid.insert(i, x[i], y[i], z[i])
    sx += x[i]
    sy += y[i]
    sz += z[i]
    fixedCount++
  }

  const bound = new Float64Array(count)
  const free: number[] = []
  for (let c = 0; c < count; c++) {
    let anchors = 0
    let ax = 0
    let ay = 0
    let az = 0
    for (let k = start[c]; k < start[c + 1]; k++) {
      const g = order[k]
      if (!fixed[g]) continue
      anchors++
      ax += x[g]
      ay += y[g]
      az += z[g]
    }
    if (anchors === 0) {
      bound[c] = buildComponent(p, order, start[c], start[c + 1], x, y, z, placed, scratch)
      free.push(c)
      continue
    }
    // Grows in the scene's frame, around its fixed groups.
    for (let k = start[c]; k < start[c + 1]; k++) {
      const g = order[k]
      if (placed[g]) continue
      let tx = 0
      let ty = 0
      let tz = 0
      let wsum = 0
      for (let e = adjStart[g]; e < adjStart[g + 1]; e++) {
        const h = adj[e]
        if (!placed[h]) continue
        tx += x[h] * adjA[e]
        ty += y[h] * adjA[e]
        tz += z[h] * adjA[e]
        wsum += adjA[e]
      }
      if (wsum > 0) {
        tx /= wsum
        ty /= wsum
        tz /= wsum
      } else {
        tx = ax / anchors
        ty = ay / anchors
        tz = az / anchors
      }
      const total = fixedCount > 0 ? fixedCount : 1
      const spot = nearestFreeSpot(p, g, x, y, z, grid, tx, ty, tz, sx / total, sy / total, sz / total, scratch)
      if (spot) {
        x[g] = spot.x
        y[g] = spot.y
        z[g] = spot.z
        grid.insert(g, spot.x, spot.y, spot.z)
      } else {
        const o = 3 * (g % RAY_DIRECTION_COUNT)
        x[g] = tx + RAY_DIRECTIONS[o] * radius[g]
        y[g] = ty + RAY_DIRECTIONS[o + 1] * radius[g]
        z[g] = tz + RAY_DIRECTIONS[o + 2] * radius[g]
      }
      placed[g] = 1
    }
  }

  // Largest ball first; ties by the component's first group (deterministic).
  free.sort((a, b) => bound[b] - bound[a] || order[start[a]] - order[start[b]])
  const off = { x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count) }
  if (fixedCount === 0) {
    packShells(free, bound, { x: 0, y: 0, z: 0 }, 0, true, off)
  } else {
    // Outside everything already in the scene, around the fixed groups' centroid.
    const centre = { x: sx / fixedCount, y: sy / fixedCount, z: sz / fixedCount }
    const isFree = new Uint8Array(count)
    for (const c of free) isFree[c] = 1
    let outer = 0
    for (let c = 0; c < count; c++) {
      if (isFree[c]) continue
      for (let k = start[c]; k < start[c + 1]; k++) {
        const g = order[k]
        outer = Math.max(outer, vecLen(x[g] - centre.x, y[g] - centre.y, z[g] - centre.z) + radius[g])
      }
    }
    packShells(free, bound, centre, outer, false, off)
  }
  for (const c of free) {
    for (let k = start[c]; k < start[c + 1]; k++) {
      const g = order[k]
      x[g] += off.x[c]
      y[g] += off.y[c]
      z[g] += off.z[c]
    }
  }
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

  // Deterministic initial placement: constructive, relation by relation (see
  // "Constructive initial placement"). It is already free of overlap, so the
  // descent below only refines it.
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const z = new Float64Array(n)
  const fixedPositions = options.fixedPositions
  let anyFixed = false
  if (fixedPositions) {
    for (let i = 0; i < n; i++) {
      const q = fixedPositions.get(ids[i])
      if (!q) continue
      p.fixed[i] = 1
      x[i] = q.x
      y[i] = q.y
      z[i] = q.z
      anyFixed = true
    }
  }
  constructPlacement(p, x, y, z)

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
  const grid = makeGrid(n, maxHardDistance(p))
  // Diagonal of the energy's Hessian per group: a step divides the force by
  // it (preconditioned Jacobi). With a raw learning rate a hub tied to fifty
  // groups, or one pair with fifty links, moved fifty times too far and every
  // step ended on the MAX_STEP clamp — measured: 801 directory groups imploded
  // into a pile of 63 000 penetrating pairs that cost 2 ms per contact sweep.
  const stiffness = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = adjStart[i]; k < adjStart[i + 1]; k++) s += 2 * LAMBDA_AFFINITY * adjA[k]
    if (adjStart[i + 1] > adjStart[i]) s += 2 * LAMBDA_ANCHOR
    if (hasPrev[i]) s += 2 * LAMBDA_STABILITY
    stiffness[i] = s
  }

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
    const alpha = STEP_FRACTION_0 * (1 - iter / maxIterations)
    let stepMax = 0
    for (let i = 0; i < n; i++) {
      if (stiffness[i] <= 0 || p.fixed[i]) continue
      const lr = alpha / stiffness[i]
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
      if (mag > stepMax) stepMax = mag
    }

    // Contact, resolved as the descent goes: an attraction can no longer drag
    // a group through the others into a pile (no global inflation needed
    // afterwards — it always hit its ×4 cap and left the cloud 3.45× too big).
    if (iter % CONTACT_EVERY === 0) {
      const pushMax = contactSweep(p, x, y, z, grid, false, CONTACT_RELAXATION, fx, fy, fz)
      // At rest: nothing moved this iteration and nothing is in contact.
      if (stepMax < SEPARATION_TOLERANCE && pushMax < SEPARATION_TOLERANCE) break
    }
  }

  separate(p, x, y, z, grid, SEPARATION_ITERATIONS)

  // Centre the cloud on the origin (the construction grows it from its first
  // group). Not when previous or fixed positions were given: the result must
  // stay in their frame.
  if (!previous && !anyFixed) {
    let mx = 0
    let my = 0
    let mz = 0
    for (let i = 0; i < n; i++) {
      mx += x[i] / n
      my += y[i] / n
      mz += z[i] / n
    }
    for (let i = 0; i < n; i++) {
      x[i] -= mx
      y[i] -= my
      z[i] -= mz
    }
  }

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
  const scratch = new Float64Array(0)
  for (let pass = 0; pass < maxPasses; pass++) {
    const maxPush = contactSweep(p, x, y, z, grid, true, 0.75, scratch, scratch, scratch)
    // Converges geometrically but never exactly: stop once a whole pass moves
    // nothing by more than SEPARATION_TOLERANCE — invisible.
    if (maxPush < SEPARATION_TOLERANCE) return pass + 1
  }
  return maxPasses
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
  const passes = separate(p, x, y, z, makeGrid(p.n, maxHardDistance(p)), maxPasses)
  p.ids.forEach((id, i) => pos.set(id, { x: x[i], y: y[i], z: z[i] }))
  return passes
}
