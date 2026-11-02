// ============================================================================
// superLinkTubes — aggregated super-edges drawn as 3D tubes (cylinders)
// ============================================================================
//
// The detail tier draws every edge as one LineSegments (1 px — WebGL lines
// cannot carry thickness). The aggregated tier has only dozens of super-edges
// ("how many real links does this community pair bundle?"), so it can afford a
// real mesh per edge: one CylinderGeometry per super-edge, whose radius follows
// √count normalized between TUBE_RADIUS_MIN and TUBE_RADIUS_MAX. A weak bundle
// stays a thin strand; a strong bundle becomes a visible ribbon — the
// "route / autoroute" reading the task asks for.
//
// COST BOUND. Tubes are O(E) meshes. They are only built while the super-edge
// count is at most TUBE_MAX_EDGES; above that the caller falls back to the
// single LineSegments (cheap for thousands of 1-px lines).
// ============================================================================

import * as THREE from 'three'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { parseColor } from './linkSegments'
import { LINK_RENDER_ORDER } from './nodePoints'

/** Smallest tube radius (weakest super-edge), world units. */
export const TUBE_RADIUS_MIN = 0.12
/** Largest tube radius (strongest super-edge), world units. */
export const TUBE_RADIUS_MAX = 1.8
/** Above this many super-edges, tubes are abandoned for 1-px segments. */
export const TUBE_MAX_EDGES = 400
/** Sides of each tube. Low is fine: the shape reads as a ribbon, not a detail. */
const TUBE_RADIAL_SEGMENTS = 8

/**
 * Tube radius for a super-edge bundling `count` links: √count normalized to
 * [0,1] across the observed [minCount, maxCount] range, mapped into
 * [TUBE_RADIUS_MIN, TUBE_RADIUS_MAX]. Pure and deterministic (unit-tested).
 */
export function tubeRadiusFor(count: number, minCount: number, maxCount: number): number {
  const c = Number.isFinite(count) && count > 0 ? count : 1
  const lo = Math.sqrt(Math.max(1, minCount))
  const hi = Math.sqrt(Math.max(1, maxCount))
  const t = hi > lo ? (Math.sqrt(c) - lo) / (hi - lo) : 0.5
  const clamped = Math.min(1, Math.max(0, t))
  return TUBE_RADIUS_MIN + (TUBE_RADIUS_MAX - TUBE_RADIUS_MIN) * clamped
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

  let minCount = Infinity
  let maxCount = -Infinity
  for (const l of links) {
    const c = typeof l.count === 'number' && Number.isFinite(l.count) ? l.count : 1
    if (c < minCount) minCount = c
    if (c > maxCount) maxCount = c
  }
  if (!Number.isFinite(minCount)) {
    minCount = 1
    maxCount = 1
  }

  const group = new THREE.Group()
  const up = new THREE.Vector3(0, 1, 0)
  const src = new THREE.Vector3()
  const dst = new THREE.Vector3()
  const dir = new THREE.Vector3()

  const tubes: { mesh: THREE.Mesh; sourceId: string; targetId: string }[] = []

  for (const link of links) {
    const count = typeof link.count === 'number' && Number.isFinite(link.count) ? link.count : 1
    const radius = tubeRadiusFor(count, minCount, maxCount)
    // Unit-height cylinder translated to span [0,1] along Y, so `scale.y = len`
    // stretches it exactly between the endpoints without touching the radius.
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, TUBE_RADIAL_SEGMENTS)
    geometry.translate(0, 0.5, 0)
    const p = parseColor(link.color)
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.r, p.g, p.b),
      transparent: true,
      opacity: p.a,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = LINK_RENDER_ORDER
    group.add(mesh)
    tubes.push({ mesh, sourceId: endpointId(link.source), targetId: endpointId(link.target) })
  }

  const updatePositions = () => {
    for (const tube of tubes) {
      const s = nodeById.get(tube.sourceId)
      const t = nodeById.get(tube.targetId)
      if (!s || !t) continue
      src.set(s.x ?? 0, s.y ?? 0, s.z ?? 0)
      dst.set(t.x ?? 0, t.y ?? 0, t.z ?? 0)
      dir.subVectors(dst, src)
      const len = dir.length()
      if (len < 1e-6) continue
      tube.mesh.position.copy(src)
      tube.mesh.quaternion.setFromUnitVectors(up, dir.normalize())
      tube.mesh.scale.set(1, len, 1)
    }
  }

  updatePositions()

  const dispose = () => {
    for (const tube of tubes) {
      tube.mesh.geometry.dispose()
      ;(tube.mesh.material as THREE.Material).dispose()
    }
  }

  return { group, count: tubes.length, updatePositions, dispose }
}
