// ============================================================================
// superLinkTubes — aggregated super-edges drawn as 3D tubes (cylinders)
// ============================================================================
//
// The detail tier draws every edge as one LineSegments (1 px — WebGL lines
// cannot carry thickness). The aggregated tier has only dozens of super-edges
// ("how many real links does this community pair bundle?"), so it can afford a
// real mesh per edge: one cylinder per super-edge.
//
// SAME SCALE LAW AS THE VASCULAR LINKS (linkRadius.ts): r = 0,03 · d0 · n^(1/3),
// d0 = median nearest-neighbour distance of the drawn super-nodes. The radii
// were absolute (0,12 → 1,8 world units, normalised between the weakest and
// strongest edge of the view): a 1-link edge had the radius of whatever was
// weakest on screen, and nothing tied the thickness to the spacing of the
// nodes. A soft ceiling (6 % of the edge length) keeps a huge bundle from
// swallowing short edges, strictly increasing so bigger still reads bigger.
//
// COST BOUND. Tubes are O(E) meshes. They are only built while the super-edge
// count is at most TUBE_MAX_EDGES; above that the caller falls back to the
// single LineSegments (cheap for thousands of 1-px lines).
// ============================================================================

import * as THREE from 'three'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { parseColor } from './linkSegments'
import { LINK_RENDER_ORDER } from './nodePoints'
import { linkRadiusFor, nearestNeighbourScale, softCap } from './linkRadius'

/** Above this many super-edges, tubes are abandoned for 1-px segments. */
export const TUBE_MAX_EDGES = 400
/** Sides of each tube. Low is fine: the shape reads as a ribbon, not a detail. */
const TUBE_RADIAL_SEGMENTS = 8

/** Ceiling of a tube radius, as a share of its length (soft, strictly increasing). */
export const TUBE_LENGTH_SHARE = 0.06

/**
 * Tube radius for a super-edge bundling `count` real links, for the node
 * spacing `d0`: the shared law `linkRadiusFor`, softly capped at
 * TUBE_LENGTH_SHARE of the edge length. Pure and deterministic.
 */
export function tubeRadiusFor(count: number, d0: number, length = Infinity): number {
  const c = Number.isFinite(count) && count > 0 ? count : 1
  const r = linkRadiusFor(c, d0)
  return length > 0 && Number.isFinite(length) ? softCap(r, TUBE_LENGTH_SHARE * length) : r
}

export interface SuperLinkTubes {
  /** The group holding every tube. Add to the scene once. */
  readonly group: THREE.Group
  /** Number of tube meshes built (=== links.length). */
  readonly count: number
  /** Re-orient each tube between its (mutable) endpoint positions. */
  updatePositions: () => void
  dispose: () => void
}

/** Resolve a link endpoint (string id or node object after d3-force resolves it). */
function endpointId(ref: unknown): string {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref === 'object' && typeof (ref as Graph3DNode).id === 'string') {
    return (ref as Graph3DNode).id
  }
  return ''
}

/**
 * Build one unlit tube per super-edge, oriented between its endpoints. Returns
 * `null` (caller falls back to LineSegments) when there are no edges or more
 * than TUBE_MAX_EDGES of them.
 */
export function createSuperLinkTubes(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
): SuperLinkTubes | null {
  if (links.length === 0 || links.length > TUBE_MAX_EDGES) return null

  const nodeById = new Map<string, Graph3DNode>()
  for (const n of nodes) nodeById.set(n.id, n)

  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const src = new THREE.Vector3()
  const dst = new THREE.Vector3()
  const dir = new THREE.Vector3()

  const tubes: { mesh: THREE.Mesh; sourceId: string; targetId: string; count: number }[] = []
  // One unit cylinder shared by every tube: radius and length are scales, so
  // a change of node spacing never rebuilds geometry.
  const unit = new THREE.CylinderGeometry(1, 1, 1, TUBE_RADIAL_SEGMENTS)
  unit.translate(0, 0.5, 0)

  for (const link of links) {
    const count = typeof link.count === 'number' && Number.isFinite(link.count) && link.count > 0 ? link.count : 1
    const p = parseColor(link.color)
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.r, p.g, p.b),
      transparent: true,
      opacity: p.a,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(unit, material)
    mesh.frustumCulled = false
    mesh.renderOrder = LINK_RENDER_ORDER
    // Hidden until placed: a tube whose endpoints are missing or coincident
    // would otherwise sit at the origin as a phantom unit cylinder.
    mesh.visible = false
    group.add(mesh)
    tubes.push({ mesh, sourceId: endpointId(link.source), targetId: endpointId(link.target), count })
  }

  // d0 of the drawn super-nodes, recomputed only when the extent changes by
  // more than 10 % (a translation keeps it, a zoom of the layout scales it).
  let d0 = 1
  let d0Extent = -1
  const refreshScale = () => {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const n of nodes) {
      const x = n.x ?? 0, y = n.y ?? 0, z = n.z ?? 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
    const extent = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
    if (!Number.isFinite(extent)) return
    if (d0Extent < 0 || Math.abs(extent - d0Extent) > 0.1 * d0Extent) {
      const d = nearestNeighbourScale(nodes.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 })))
      d0 = d > 0 ? d : extent > 0 ? extent / Math.max(1, Math.cbrt(nodes.length)) : 1
      d0Extent = extent
    }
  }

  const updatePositions = () => {
    refreshScale()
    for (const tube of tubes) {
      const s = nodeById.get(tube.sourceId)
      const t = nodeById.get(tube.targetId)
      if (!s || !t) { tube.mesh.visible = false; continue }
      src.set(s.x ?? 0, s.y ?? 0, s.z ?? 0)
      dst.set(t.x ?? 0, t.y ?? 0, t.z ?? 0)
      dir.subVectors(dst, src)
      const len = dir.length()
      if (!(len > 1e-6)) { tube.mesh.visible = false; continue }
      const radius = tubeRadiusFor(tube.count, d0, len)
      tube.mesh.position.copy(src)
      tube.mesh.quaternion.setFromUnitVectors(up, dir.normalize())
      tube.mesh.scale.set(radius, len, radius)
      tube.mesh.visible = true
    }
  }

  updatePositions()

  const dispose = () => {
    unit.dispose()
    for (const tube of tubes) (tube.mesh.material as THREE.Material).dispose()
  }

  return { group, count: tubes.length, updatePositions, dispose }
}
