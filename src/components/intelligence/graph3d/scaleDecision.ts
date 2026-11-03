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
 * Distance at which the auto-frame places the camera, in units of the radius
 * the zoom handler passes as `clusterRadius`: radius / sin(fov / 2) × 1.06 with
 * the 45° fov of the scene, ≈ 2.77. The renderer's zoom handler passes the
 * GRAPH radius, i.e. the same yardstick the framing uses.
 */
export const FRAMING_DISTANCE_RATIO = 1.06 / Math.sin((45 * Math.PI) / 180 / 2)

/**
 * Degroup (one level DOWN) when the camera is closer than this many radii.
 *
 * It MUST sit below FRAMING_DISTANCE_RATIO: at 3 the framing distance (2.77)
 * was already "close", so the first gesture after an auto-frame — a tiny
 * rotation — dropped one level without the user zooming at all. At 2 the
 * framing sits inside the dead zone [2, 6] with a ≈ 28 % margin; zooming in to
 * 2 radii (inside the cloud's outer shell) still degroups.
 */
export const DEGROUP_DISTANCE_RATIO = 2

/**
 * Regroup (one level UP) when the camera is further than this many radii:
 * ≈ 2.2 × the framing distance, so reachable before the orbit limit
 * (OrbitControls.maxDistance = 3 × framing ≈ 8.3 radii).
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
