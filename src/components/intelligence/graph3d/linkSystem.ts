// ============================================================================
// linkSystem — the single pipeline of the Organic Link Engine V2
// ============================================================================
//
// One entry point, four stages, all pure:
//
//   links ──▶ corridors ──▶ magnitude ──▶ morphology ──▶ LOD ──▶ bundles
//             (T6 routing)   (T1 counting)  (T2/T3 volume)  (T4)
//
// WHY A SINGLE PIPELINE. The renderer used to choose between three global
// regimes (detail / bundle / sheet, thresholds 800 and 3 000) — three answers
// for a question that has as many answers as there are bundles. Here the
// DECISION is per corridor and the BUDGET is global: each bundle is shaped by
// what it carries, and the sum stops at `maxTriangles`.
//
// THE ACCEPTANCE CRITERION OF THE BRIEF lives in this file, and a test asserts
// it: going from 10⁶ to 10⁹ relations must change the representation without
// multiplying the GPU work by 1 000. The triangle count depends on the number
// of CORRIDORS and their LOD — never on the number of relations a corridor
// summarises.
// ============================================================================

import type { Magnitude } from './linkMagnitude'
import { describeMagnitude } from './linkMagnitude'
import { type MorphologyShape, morphologyShape } from './linkMorphology'
import { type LodState, lodFor, lodOptionsForScene } from './linkLod'
import { endpointToken, type Corridor } from './linkRouting'
import { type ExactShape, renderedBundleTriangles, trunkLanes } from './linkGeometryCost'

/**
 * The minimum a corridor must expose to be drawn: an identity, its two ends,
 * and its exact magnitude.
 *
 * It is deliberately NOT `Corridor` (which also holds the real links): a graph
 * that summarises 10⁹ relations cannot materialise 10⁹ objects, so the system
 * must accept a count that arrived pre-aggregated from the backend. Same
 * pipeline, same guarantees — only the provenance of the count differs.
 */
export interface SystemCorridor {
  key: string
  from: string
  to: string
  magnitude: Magnitude
  /** Relation families the corridor carries (one trunk lane each). Unknown ⇒ upper bound. */
  families?: number
  /** Distinct real endpoints on the `from` and `to` sides (the branch trees). Unknown ⇒ upper bound. */
  endpoints?: readonly [number, number]
  /** Layer of the corridor (its dominant link layer), for the per-layer merge. */
  layer?: string
}

const endId = (end: unknown): string =>
  typeof end === 'object' && end !== null ? (end as { id: string }).id : String(end)

/**
 * Adapt the routed corridors (T6) to the pipeline's input, with the shape the
 * renderer will draw: its families (trunk lanes) and its distinct endpoints on
 * each side (branch trees) — the same side rule as the renderer's geometryOf.
 */
export function fromCorridors(corridors: readonly Corridor[]): SystemCorridor[] {
  return corridors.map((c) => {
    const sideA = new Set<string>()
    const sideB = new Set<string>()
    for (const link of c.links) {
      const s = endId(link.source)
      const t = endId(link.target)
      if (endpointToken(link.sourceCommunityId, s) === c.from) {
        sideA.add(s)
        sideB.add(t)
      } else {
        sideA.add(t)
        sideB.add(s)
      }
    }
    const layers = new Map<string, number>()
    for (const link of c.links) layers.set(link.layer, (layers.get(link.layer) ?? 0) + 1)
    let layer: string | undefined
    for (const [l, n] of [...layers].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (layer === undefined || n > (layers.get(layer) ?? 0)) layer = l
    }
    return {
      key: c.key, from: c.from, to: c.to, magnitude: c.magnitude,
      families: c.families.length,
      endpoints: [sideA.size, sideB.size] as const,
      layer,
    }
  })
}

/** What the renderer may spend, and where the camera stands. */
export interface SystemBudget {
  /** Hard ceiling on the triangles the link layer may submit. */
  maxTriangles: number
  /** Hard ceiling on drawn bundles (the rest are merged into aggregates, never dropped). */
  maxCorridors: number
  /** Camera distance to the graph centre, for the LOD. */
  cameraDistance: number
  /**
   * Radius of the scene (graph bounding radius). When given, the LOD
   * thresholds are relative to it (lodOptionsForScene): 2 R / 3 R. Without it
   * the absolute DEFAULT_LOD_OPTIONS (400 / 600) apply — which never refine on
   * a real scene, framed at 2.77 R ≥ 900.
   */
  sceneRadius?: number
  /** Mobile-like device: the renderer draws 2 channels per conduit. */
  mobile?: boolean
  /**
   * EXACT shape of a bundle as the renderer will build it (it depends on the
   * node positions: spatial sub-hubs, per-conduit content). `members` lists
   * the corridors an aggregate carries. Without it, the cost model takes its
   * upper bound. `null` = the renderer will draw nothing for this bundle.
   */
  shapeOf?: (corridor: SystemCorridor, members?: readonly string[]) => ExactShape | null
}

/** Samples along the spline at depth 0, and the growth per refinement level. */
export const SAMPLES_BASE = 8
export const SAMPLES_PER_DEPTH = 6

export const DEFAULT_SYSTEM_BUDGET: SystemBudget = {
  maxTriangles: 240_000,
  maxCorridors: 4_000,
  cameraDistance: 400,
}

/** One drawable bundle: what to draw, how, and what it costs. */
export interface DrawableBundle {
  corridor: SystemCorridor
  /**
   * Keys of the corridors this bundle AGGREGATES (absent for a single
   * corridor). Its `corridor` is then synthetic: key `agg:<level>:<head>`,
   * drawn along its biggest member's pair, magnitude = exact sum of members.
   */
  members?: string[]
  morphology: MorphologyShape
  lod: LodState
  /** Trunk lanes the renderer draws (one per relation family, ≤ 5). */
  strands: number
  /** Rings actually drawn. */
  samples: number
  /** Triangles this bundle costs at this LOD. */
  triangles: number
}

export interface LinkSystemStats {
  /** Corridors the input held. */
  corridors: number
  /** Corridors actually drawn (the rest are aggregated into their neighbours). */
  drawn: number
  /** Triangles the whole link layer will submit — never above the budget. */
  triangles: number
  /** Exact relations represented by ALL corridors, drawn or not. */
  exactRelations: bigint
  /** Exact relations represented by the DRAWN corridors. */
  drawnRelations: bigint
  /** True when the budget forced part of the graph into a coarser representation. */
  aggregated: boolean
}

export interface LinkSystem {
  bundles: DrawableBundle[]
  stats: LinkSystemStats
}

/** What, besides the LOD and the morphology, decides a bundle's geometry. */
export interface BundleShape {
  /** Relations carried (bounds every conduit's content). */
  n?: number
  families?: number
  endpoints?: readonly [number, number]
  mobile?: boolean
  /** Exact shape from the positions (see SystemBudget.shapeOf). */
  exact?: ExactShape | null
}

/**
 * Triangles a bundle costs in the RENDERER.
 *
 * The shared model (`renderedBundleTriangles`) counts what linkVascularRenderer
 * builds: one trunk per family lane (≤ 5) at the LOD's samples, then on each
 * side its arteries (7 samples), capillaries (5) and closing capsules (5),
 * every conduit with the layers its OWN content earns (scale law: one
 * relation = core + one skin; then 1 + ⌊log2 n⌋ channels, ≤ families, ≤ 5).
 * With `shape.exact` (computed on the positions) it is exact to the triangle;
 * without, an upper bound.
 */
export function bundleTriangles(lod: LodState, morphologyChannels: number, shape: BundleShape = {}): number {
  return renderedBundleTriangles({
    trunkSamples: SAMPLES_BASE + SAMPLES_PER_DEPTH * lod.depth,
    morphologyChannels,
    n: shape.n,
    families: shape.families,
    endpoints: shape.endpoints,
    mobile: shape.mobile,
    exact: shape.exact,
  })
}

/** Coarser groupings tried, in order, for the corridors the budget cannot draw one by one. */
export type MergeLevel = 'hub' | 'layer' | 'all'
export const MERGE_LEVELS: readonly MergeLevel[] = ['hub', 'layer', 'all']

const LOD_ZERO: LodState = { depth: 0, canRefine: true, visible: 'aggregate' }

/** One unit to draw: a corridor alone, or the aggregate of several. */
interface Unit {
  corridor: SystemCorridor
  members?: string[]
  shape: BundleShape
  channels: number
  morphology: MorphologyShape
  /** Cost at depth 0, the cheapest shape. */
  minCost: number
}

const byMagnitudeThenKey = (x: SystemCorridor, y: SystemCorridor) => {
  if (x.magnitude.exactCount !== y.magnitude.exactCount) {
    return x.magnitude.exactCount > y.magnitude.exactCount ? -1 : 1
  }
  return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
}

/**
 * Merge `rest` (sorted by magnitude) at `level` into aggregate corridors:
 *   hub   — per hub: each corridor joins the heavier of its two ends (mass =
 *           relations touching it), "everything else that leaves c7";
 *   layer — per layer of the corridor (`layer`, else one group);
 *   all   — one bundle.
 * An aggregate is drawn along its biggest member (a real pair of hubs), with
 * the exact sum of its members' counts and no claim on families or endpoints
 * (the cost model then takes its upper bound).
 */
function mergeAt(rest: readonly SystemCorridor[], level: MergeLevel, mass: Map<string, bigint>): SystemCorridor[][] {
  const groups = new Map<string, SystemCorridor[]>()
  for (const c of rest) {
    let key: string
    if (level === 'hub') {
      const mf = mass.get(c.from) ?? 0n
      const mt = mass.get(c.to) ?? 0n
      key = mf > mt || (mf === mt && c.from <= c.to) ? c.from : c.to
    } else if (level === 'layer') {
      key = c.layer ?? ''
    } else {
      key = ''
    }
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }
  return [...groups.keys()].sort().map((k) => groups.get(k)!)
}

/**
 * Build the drawable link system.
 *
 * Order of operations, and why:
 *  1. the corridors are sorted by magnitude DESC, then by key — the biggest
 *     bundles earn the budget first, and the result stays deterministic;
 *  2. if they do not all fit (triangles at their cheapest shape, or the
 *     corridor ceiling), the TOP k stay individual and the rest is MERGED into
 *     coarser aggregate bundles — per hub, else per layer, else into one — with
 *     k the largest that fits. "Aggregated, never lost": every relation is
 *     counted in exactly one drawn bundle (`members` lists the corridors an
 *     aggregate carries), as long as the budget holds one bundle at all;
 *  3. every bundle starts at depth 0, then each, biggest first, is refined
 *     towards its LOD depth while the remaining budget pays for it.
 *
 * The previous version dropped (`continue`) whatever did not fit: at 20 000
 * nodes / 40 000 links, 47 corridors drawn and 0.6 % of the relations shown.
 */
export function buildLinkSystem(
  corridors: readonly SystemCorridor[],
  budget: Partial<SystemBudget> = {},
): LinkSystem {
  const b: SystemBudget = { ...DEFAULT_SYSTEM_BUDGET, ...budget }
  if (!(b.maxTriangles >= 0) || !(b.maxCorridors >= 0)) {
    throw new RangeError('the system budget must be non-negative')
  }
  const lodOptions = b.sceneRadius !== undefined ? lodOptionsForScene(b.sceneRadius) : undefined

  const ordered = [...corridors].sort(byMagnitudeThenKey)
  let exactRelations = 0n
  for (const c of corridors) exactRelations += c.magnitude.exactCount

  const unitOf = (corridor: SystemCorridor, members?: string[]): Unit => {
    const morphology = morphologyShape(corridor.magnitude)
    const channels = morphology.graphical.channels
    const shape: BundleShape = {
      n: Number(corridor.magnitude.exactCount),
      families: corridor.families,
      endpoints: corridor.endpoints,
      mobile: b.mobile,
      exact: b.shapeOf ? b.shapeOf(corridor, members) : undefined,
    }
    return { corridor, members, shape, channels, morphology, minCost: bundleTriangles(LOD_ZERO, channels, shape) }
  }
  const singles = ordered.map((c) => unitOf(c))
  const prefix = [0]
  for (const u of singles) prefix.push(prefix[prefix.length - 1] + u.minCost)

  const mass = new Map<string, bigint>()
  for (const c of corridors) {
    mass.set(c.from, (mass.get(c.from) ?? 0n) + c.magnitude.exactCount)
    if (c.to !== c.from) mass.set(c.to, (mass.get(c.to) ?? 0n) + c.magnitude.exactCount)
  }
  const aggregates = (rest: readonly SystemCorridor[], level: MergeLevel): Unit[] =>
    mergeAt(rest, level, mass).map((group) => {
      if (group.length === 1) return unitOf(group[0])
      let sum = 0n
      for (const c of group) sum += c.magnitude.exactCount
      const head = group[0]
      return unitOf(
        { key: `agg:${level}:${head.key}`, from: head.from, to: head.to, magnitude: describeMagnitude(sum), layer: head.layer },
        group.map((c) => c.key),
      )
    })

  // ── Choose what is individual and what is merged ────────────────────────
  const fits = (units: number, cost: number) => units <= b.maxCorridors && cost <= b.maxTriangles
  let units: Unit[] = []
  if (fits(singles.length, prefix[singles.length])) {
    units = singles
  } else {
    for (const level of MERGE_LEVELS) {
      const tryK = (k: number): Unit[] | null => {
        const merged = aggregates(ordered.slice(k), level)
        let cost = prefix[k]
        for (const u of merged) cost += u.minCost
        return fits(k + merged.length, cost) ? [...singles.slice(0, k), ...merged] : null
      }
      // largest k that fits: binary search, then confirmed (the cost is
      // monotone in k up to the merge granularity)
      let lo = 0
      let hi = singles.length - 1
      let best: Unit[] | null = tryK(0)
      if (!best) continue
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        const r = tryK(mid)
        if (r) {
          best = r
          lo = mid
        } else {
          hi = mid - 1
        }
      }
      units = best
      break
    }
  }

  // ── Depth: cheapest first for all, then refine the biggest first ─────────
  let triangles = 0
  for (const u of units) triangles += u.minCost
  const bundles: DrawableBundle[] = units.map((u) => {
    const lod = lodFor(u.corridor.magnitude, b.cameraDistance, lodOptions)
    let depth = lod.depth
    let cost = bundleTriangles({ ...lod, depth }, u.channels, u.shape)
    // The budget is a CEILING: a bundle refines only as far as what is left pays.
    while (depth > 0 && cost - u.minCost > b.maxTriangles - triangles) {
      depth -= 1
      cost = bundleTriangles({ ...lod, depth }, u.channels, u.shape)
    }
    triangles += cost - u.minCost
    const visible: LodState = depth === lod.depth ? lod : { ...lod, depth, canRefine: false }
    return {
      corridor: u.corridor,
      members: u.members,
      morphology: u.morphology,
      lod: visible,
      strands: trunkLanes(u.corridor.families ?? Infinity, u.channels),
      samples: SAMPLES_BASE + SAMPLES_PER_DEPTH * depth,
      triangles: cost,
    }
  })

  let drawnRelations = 0n
  for (const bd of bundles) drawnRelations += bd.corridor.magnitude.exactCount

  return {
    bundles,
    stats: {
      corridors: corridors.length,
      drawn: bundles.length,
      triangles,
      exactRelations,
      drawnRelations,
      aggregated: bundles.length < corridors.length,
    },
  }
}

/** Convenience: a corridor whose count arrived as a plain integer, for tests and synthetic feeds. */
export function syntheticCorridor(key: string, from: string, to: string, count: bigint): SystemCorridor {
  return { key, from, to, magnitude: describeMagnitude(count) }
}
