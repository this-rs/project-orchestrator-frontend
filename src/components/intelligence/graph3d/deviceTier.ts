// ============================================================================
// deviceTier — what the device can carry decides how much graph it is given
// ============================================================================
//
// A full graph (~20 000 nodes, tens of thousands of edges, community halos,
// labels, a Louvain worker) is a desktop workload. On a phone the same page
// runs out of memory or loses its WebGL context. Rather than a hard-coded
// "mobile = fewer", the device is classified ONCE into a tier and every
// resource-hungry feature reads its threshold from `TIER_BUDGETS[tier]`.
//
//   classifyDevice(signals)  pure: signals in, tier out (unit-tested)
//   readDeviceSignals()      the only impure part: matchMedia / navigator / DPR
//   TIER_BUDGETS             the named, documented thresholds a tier drives
//
// No user-agent sniffing and no dependency: only capabilities the browser
// reports. Every signal can be absent (Safari/Firefox have no `deviceMemory`,
// jsdom has no `matchMedia`) and an absent signal never LOWERS the tier by
// itself — it just does not vote.
// ============================================================================

export type DeviceTier = 'low' | 'medium' | 'high'

/** What the browser tells us. Every field but `coarsePointer` may be unknown. */
export interface DeviceSignals {
  /** `matchMedia('(pointer: coarse)')` — a finger, not a mouse. */
  coarsePointer: boolean
  /** `navigator.deviceMemory`, GB, bucketed by the browser (0.25 … 8). Absent on Safari/Firefox. */
  deviceMemoryGb?: number
  /** `navigator.hardwareConcurrency`. */
  cores?: number
  /** `window.devicePixelRatio`. */
  pixelRatio?: number
}

/** `deviceMemory` at or below this is a low-end device whatever its pointer. */
export const LOW_MEMORY_GB = 2
/** `deviceMemory` at or below this keeps a desktop out of the top tier. */
export const MEDIUM_MEMORY_GB = 4
/** Fewer cores than this (inclusive) is a low-end CPU. */
export const LOW_CORES = 2
/** Up to this many cores (inclusive) a desktop is not top tier. */
export const MEDIUM_CORES = 4
/** A touch device needs at least this much memory AND cores to be considered top tier (large tablet). */
export const TOUCH_HIGH_MEMORY_GB = 8
export const TOUCH_HIGH_CORES = 8
/** A very dense screen with a touch pointer and unknown memory costs fill-rate: treated as `low`. */
export const DENSE_TOUCH_PIXEL_RATIO = 3

const known = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * Pure classification.
 *
 *   low     a low-memory / low-core device, or a touch device whose memory is
 *           unreported AND whose panel is very dense (3× retina phone on Safari)
 *   medium  any other touch device, or a desktop with ≤ 4 GB / ≤ 4 cores
 *   high    a desktop with enough memory/cores (or that reports neither), or a
 *           touch device with ≥ 8 GB and ≥ 8 cores (large tablet)
 *
 * The desktop default is `high`: with nothing reported, the rendering is the
 * one the app always had.
 */
export function classifyDevice(s: DeviceSignals): DeviceTier {
  const mem = known(s.deviceMemoryGb) ? s.deviceMemoryGb : undefined
  const cores = known(s.cores) ? s.cores : undefined

  if (mem !== undefined && mem <= LOW_MEMORY_GB) return 'low'
  if (cores !== undefined && cores <= LOW_CORES) return 'low'

  if (s.coarsePointer) {
    if (mem === undefined && known(s.pixelRatio) && s.pixelRatio >= DENSE_TOUCH_PIXEL_RATIO) return 'low'
    if (
      mem !== undefined && mem >= TOUCH_HIGH_MEMORY_GB
      && cores !== undefined && cores >= TOUCH_HIGH_CORES
    ) return 'high'
    return 'medium'
  }

  if (mem !== undefined && mem <= MEDIUM_MEMORY_GB) return 'medium'
  if (cores !== undefined && cores <= MEDIUM_CORES) return 'medium'
  return 'high'
}

/**
 * The thresholds a tier drives. `high` is exactly what the app did before
 * tiers existed (these numbers are asserted in deviceTier.test.ts).
 */
export interface TierBudget {
  /**
   * TOTAL node budget requested from the API, split across the layers asked
   * (`useIntelligenceGraph` divides it per category).
   */
  nodeBudget: number
  /**
   * Community halos (convex-hull meshes + label textures) are built only when
   * the graph has at most this many nodes. `Infinity` = always (desktop).
   */
  maxNodesForHulls: number
  /** Billboard name labels (SpriteText, one canvas texture each) only up to this many nodes. */
  maxNodesForLabels: number
  /** How many billboard labels at most when they are allowed. */
  labelLimit: number
  /**
   * Client-side Louvain (worker) runs only up to this many nodes; above it the
   * server-provided / directory grouping stays. `Infinity` = always.
   */
  maxNodesForCommunityDetection: number
  /** Ceiling for the device pixel ratio the render loop may open at. */
  maxPixelRatio: number
  /**
   * Triangles the link layer may submit (SystemBudget.maxTriangles) before the
   * frame governor scales it (frameQuality.linkBudgetFor). medium and low
   * already open at pixel ratio 1.0: without this the governor had no lever
   * left on exactly the devices that need one.
   */
  maxLinkTriangles: number
  /** Bundles the link layer may draw (SystemBudget.maxCorridors). */
  maxLinkBundles: number
}

export const TIER_BUDGETS: Record<DeviceTier, TierBudget> = {
  high: {
    nodeBudget: 20_000,
    maxNodesForHulls: Infinity,
    maxNodesForLabels: Infinity,
    labelLimit: 40,
    maxNodesForCommunityDetection: Infinity,
    maxPixelRatio: 1.5,
    maxLinkTriangles: 240_000, // = DEFAULT_SYSTEM_BUDGET (linkSystem.ts)
    maxLinkBundles: 4_000,
  },
  medium: {
    nodeBudget: 8_000,
    maxNodesForHulls: 4_000, // = AUTO_AGGREGATE_ABOVE: one mesh + label texture per community (766 textures at 5 000 nodes, measured)
    maxNodesForLabels: 8_000,
    labelLimit: 20,
    maxNodesForCommunityDetection: 8_000,
    maxPixelRatio: 1.0,
    maxLinkTriangles: 120_000,
    maxLinkBundles: 2_000,
  },
  low: {
    nodeBudget: 4_000,
    maxNodesForHulls: 2_000,
    maxNodesForLabels: 2_000,
    labelLimit: 10,
    maxNodesForCommunityDetection: 4_000,
    maxPixelRatio: 1.0,
    maxLinkTriangles: 60_000,
    maxLinkBundles: 1_000,
  },
}

/** Read the browser's signals. Safe where `window`, `matchMedia` or `navigator` are missing. */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') return { coarsePointer: false }
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { deviceMemory?: number })
    | undefined
  return {
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    deviceMemoryGb: nav?.deviceMemory,
    cores: nav?.hardwareConcurrency,
    pixelRatio: window.devicePixelRatio,
  }
}

let cached: { tier: DeviceTier; budget: TierBudget } | null = null

/** The tier of THIS device, classified once per page load. */
export function currentDeviceBudget(): { tier: DeviceTier; budget: TierBudget } {
  if (!cached) {
    const tier = classifyDevice(readDeviceSignals())
    cached = { tier, budget: TIER_BUDGETS[tier] }
  }
  return cached
}

/** Test seam: forget the cached classification. */
export function resetDeviceBudgetCache(): void {
  cached = null
}
