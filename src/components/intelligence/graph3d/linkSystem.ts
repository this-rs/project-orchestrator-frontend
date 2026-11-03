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
import { type LodState, lodFor } from './linkLod'
import { endpointToken, type Corridor } from './linkRouting'
import { renderedBundleTriangles, trunkLanes } from './linkGeometryCost'

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
    return {
      key: c.key, from: c.from, to: c.to, magnitude: c.magnitude,
      families: c.families.length,
      endpoints: [sideA.size, sideB.size] as const,
    }
  })
}

/** What the renderer may spend, and where the camera stands. */
export interface SystemBudget {
  /** Hard ceiling on the triangles the link layer may submit. */
  maxTriangles: number
  /** Hard ceiling on drawn corridors (the rest are aggregated, never dropped). */
  maxCorridors: number
  /** Camera distance to the graph centre, for the LOD. */
  cameraDistance: number
  /** Mobile-like device: the renderer draws 2 channels per conduit. */
  mobile?: boolean
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
  families?: number
  endpoints?: readonly [number, number]
  mobile?: boolean
}

/**
 * Triangles a bundle costs in the RENDERER — the relation count never enters.
 *
 * The shared model (`renderedBundleTriangles`) counts what linkVascularRenderer
 * builds: one trunk per family lane (≤ 5) at the LOD's samples, then on each
 * side up to 3 arteries (7 samples) and 3 capillaries each (5 samples), every
 * conduit with halo + sheath + structure + [2, 5] channels + core (≥ 6 layers).
 * The previous estimate counted ONE trunk with 1 channel at depth 0, 4 layers
 * per branch and 5 samples for every branch: 236 k announced for 550 k drawn.
 */
export function bundleTriangles(lod: LodState, morphologyChannels: number, shape: BundleShape = {}): number {
  return renderedBundleTriangles({
    trunkSamples: SAMPLES_BASE + SAMPLES_PER_DEPTH * lod.depth,
    morphologyChannels,
    families: shape.families,
    endpoints: shape.endpoints,
    mobile: shape.mobile,
  })
}

/**
 * Build the drawable link system.
 *
 * Order of operations, and why:
 *  1. the corridors are sorted by magnitude DESC, then by key — the biggest
 *     bundles earn the budget first, and the result stays deterministic;
 *  2. each corridor gets its morphology (what it looks like) and its LOD
 *     (how deep it is decomposed at this camera distance);
 *  3. a corridor is drawn only if it fits the remaining triangle budget AND the
 *     corridor ceiling. A corridor that does not fit is NOT lost: its exact
 *     count stays in `stats.exactRelations`, and `aggregated` says so.
 *
 * The caller therefore always knows the true total, even when the render had to
 * simplify it — which is the whole point of keeping the logical volume separate
 * from the graphical one.
 */
export function buildLinkSystem(
  corridors: readonly SystemCorridor[],
  budget: Partial<SystemBudget> = {},
): LinkSystem {
  const b: SystemBudget = { ...DEFAULT_SYSTEM_BUDGET, ...budget }
  if (!(b.maxTriangles >= 0) || !(b.maxCorridors >= 0)) {
    throw new RangeError('the system budget must be non-negative')
  }

  const ordered = [...corridors].sort((x, y) => {
    if (x.magnitude.exactCount !== y.magnitude.exactCount) {
      return x.magnitude.exactCount > y.magnitude.exactCount ? -1 : 1
    }
    return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
  })

  let exactRelations = 0n
  for (const c of corridors) exactRelations += c.magnitude.exactCount

  const bundles: DrawableBundle[] = []
  let triangles = 0
  let drawnRelations = 0n

  for (const corridor of ordered) {
    if (bundles.length >= b.maxCorridors) break
    const morphology = morphologyShape(corridor.magnitude)
    const lod = lodFor(corridor.magnitude, b.cameraDistance)
    const channels = morphology.graphical.channels
    const shape: BundleShape = { families: corridor.families, endpoints: corridor.endpoints, mobile: b.mobile }
    const cost = bundleTriangles(lod, channels, shape)
    // The budget is a CEILING, not a target: one oversized bundle must not be
    // drawn "because it is first". It falls back to the aggregate shape, which
    // costs one strand, and is drawn if even that fits.
    let depth = lod.depth
    let visible = lod
    let cost_ = cost
    while (cost_ > b.maxTriangles - triangles && depth > 0) {
      depth -= 1
      visible = { ...lod, depth, canRefine: false }
      cost_ = bundleTriangles(visible, channels, shape)
    }
    if (cost_ > b.maxTriangles - triangles) continue
    triangles += cost_
    drawnRelations += corridor.magnitude.exactCount
    bundles.push({
      corridor,
      morphology,
      lod: visible,
      strands: trunkLanes(corridor.families ?? Infinity, channels),
      samples: SAMPLES_BASE + SAMPLES_PER_DEPTH * depth,
      triangles: cost_,
    })
  }

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
