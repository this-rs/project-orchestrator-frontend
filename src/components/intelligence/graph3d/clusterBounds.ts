// ============================================================================
// clusterBounds — shared centroid/radius computation for node clusters
// ============================================================================
//
// Single implementation used by:
//   - useActivationSync (camera zoom to activated cluster)
//   - EnergyTerrain3D / hull scheduling (cluster extents)
//
// Replaces the duplicated centroid+radius math that lived in both
// IntelligenceGraph3D.tsx and useActivationSync.ts.
// ============================================================================

/** Minimal positioned node shape (d3-force mutable coordinates) */
export interface PositionedNode {
  x?: number
  y?: number
  z?: number
}

export interface ClusterBounds {
  centroid: { x: number; y: number; z: number }
  /** Max distance from centroid to any member */
  radius: number
  /** Number of members included */
  count: number
}

/**
 * Compute the centroid and bounding radius of the nodes matching `match`.
 * Returns null when no node matches.
 */
export function computeClusterBounds<T extends PositionedNode>(
  nodes: T[],
  match: (node: T) => boolean,
): ClusterBounds | null {
  let cx = 0
  let cy = 0
  let cz = 0
  let count = 0
  const positions: { x: number; y: number; z: number }[] = []

  for (const node of nodes) {
    if (!match(node)) continue
    const x = node.x ?? 0
    const y = node.y ?? 0
    const z = node.z ?? 0
    cx += x
    cy += y
    cz += z
    count++
    positions.push({ x, y, z })
  }

  if (count === 0) return null
  cx /= count
  cy /= count
  cz /= count

  let radius = 0
  for (const p of positions) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2)
    if (d > radius) radius = d
  }

  return { centroid: { x: cx, y: cy, z: cz }, radius, count }
}

/**
 * Camera placement for framing a cluster: distance proportional to the
 * cluster radius, offset along a diagonal for perspective.
 */
export function cameraPositionForCluster(bounds: ClusterBounds): {
  position: { x: number; y: number; z: number }
  lookAt: { x: number; y: number; z: number }
} {
  const { centroid, radius } = bounds
  const dist = Math.max(radius * 2.5, 120)
  const angle = Math.atan2(centroid.y, centroid.x)
  return {
    position: {
      x: centroid.x + dist * Math.cos(angle + 0.3),
      y: centroid.y + dist * 0.4,
      z: centroid.z + dist * Math.sin(angle + 0.3),
    },
    lookAt: { x: centroid.x, y: centroid.y, z: centroid.z },
  }
}
