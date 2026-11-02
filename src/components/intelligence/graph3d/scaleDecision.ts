// ============================================================================
// scaleDecision — the multi-scale zoom decision as a pure function
// ============================================================================
//
// The semantic zoom changes the aggregation level when the camera crosses a
// distance threshold. The threshold is expressed in CLUSTER RADII, not in graph
// radii: a ratio against the whole graph is the wrong yardstick, because at 1.7×
// the graph's radius the clusters are still tiny on screen and the view would
// degroup before the user could read the level they were on. Measured against
// one cluster, the level only changes when the members are really
// distinguishable (close) or really blurred (far).
//
// Everything here is pure and unit-tested without WebGL.
// ============================================================================

import type { Graph3DNode } from './useGraph3DLayout'

/**
 * Degroup (one level DOWN) when the camera is closer than this many cluster
 * radii. A cluster's members spread over ≈1 of its own radii, so within 3 radii
 * the cluster fills enough of the viewport that its internal structure resolves.
 */
export const DEGROUP_DISTANCE_RATIO = 3

/**
 * Regroup (one level UP) when the camera is further than this many cluster
 * radii. At 6 radii a cluster is small enough on screen that its internal
 * detail is lost, so bundling it up again loses nothing readable.
 */
export const REGROUP_DISTANCE_RATIO = 6

/**
 * Visual radius of one super-node (cluster), the same formula the renderer's
 * `baseNodeSize` uses (area ∝ count → radius ∝ √count). Returns 0 for a plain
 * node (no `count`, or a cluster of one).
 */
export function superNodeRadius(node: Graph3DNode): number {
  const count = node.data.count as number | undefined
  if (typeof count !== 'number' || count <= 1) return 0
  return 3 + 2.6 * Math.sqrt(count)
}

/**
 * Characteristic cluster radius of a tier: the MEDIAN super-node radius.
 * Median, not mean: one huge catch-all group ("everything else", the
 * `capGroups` fallback) would drag a mean out to its own scale and break the
 * threshold. Returns 0 when the tier has no real cluster (e.g. the detail
 * level, or a graph whose groups are all singletons).
 */
export function characteristicClusterRadius(nodes: Graph3DNode[]): number {
  const radii = nodes
    .map(superNodeRadius)
    .filter((r) => r > 0)
    .sort((a, b) => a - b)
  if (radii.length === 0) return 0
  const mid = Math.floor(radii.length / 2)
  return radii.length % 2 === 1 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2
}

/**
 * The next aggregation level for a camera at `distance` from the orbit target,
 * given the current tier's characteristic `clusterRadius` and the `currentLevel`.
 *
 *   • `distance <  DEGROUP_DISTANCE_RATIO × clusterRadius` → level − 1 (closer:
 *     the members of a cluster are distinguishable);
 *   • `distance >  REGROUP_DISTANCE_RATIO × clusterRadius` → level + 1 (further:
 *     the cluster is too small to read);
 *   • otherwise → level unchanged (the dead zone between the two thresholds is
 *     the hysteresis that stops a boundary from flickering).
 *
 * The caller clamps the result to the available levels (0 … MAX_SCALE).
 */
export function nextScaleLevel(
  distance: number,
  clusterRadius: number,
  currentLevel: number,
): number {
  if (!Number.isFinite(distance) || distance < 0) return currentLevel
  if (!Number.isFinite(clusterRadius) || clusterRadius <= 0) return currentLevel
  const ratio = distance / clusterRadius
  if (currentLevel > 0 && ratio < DEGROUP_DISTANCE_RATIO) return currentLevel - 1
  if (ratio > REGROUP_DISTANCE_RATIO) return currentLevel + 1
  return currentLevel
}
