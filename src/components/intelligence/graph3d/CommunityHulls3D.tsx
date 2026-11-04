// ============================================================================
// CommunityHulls3D — real convex-hull envelopes for community clusters
// ============================================================================
//
// Draws a translucent CONVEX HULL (three's ConvexGeometry) around the members
// of each community at the aggregated tier, so a cluster reads as a volume
// without swallowing the nodes inside it.
//
// This replaces an earlier fan-triangulated "hull" (a triangle fan from the
// centroid, projected onto XZ) that scaled up to cover a whole cluster and
// turned the scene into an opaque blob (screenshots of 02/11). The real hull
// is the smallest convex surface enclosing the members, inflated outward by a
// small fraction of the community's radius (see communityHullPrep.ts).
//
// The selection of which communities to wrap (min size, max count, expansion)
// lives in the pure `prepareCommunityHulls`; this module only turns its output
// into three.js meshes. Fill and wireframe are deliberately faint
// (fillOpacity 0.05–0.08, wire 0.03) and `depthWrite: false`, and they render
// BEFORE the nodes (renderOrder < nodes), so the nodes always stay in front.
// ============================================================================

import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { layerColor } from './layerColors'
import {
  prepareCommunityHulls,
  type CommunityHullPrepOptions,
  type PreparedCommunityHull,
} from './communityHullPrep'
import { COMMUNITY_FILL_OPACITY_REST, COMMUNITY_WIRE_OPACITY_REST } from './communityActivity'
import type { Graph3DNode } from './useGraph3DLayout'

// ── Render order ────────────────────────────────────────────────────────────
// Nodes (THREE.Points) render at NODE_POINTS_RENDER_ORDER = 10; links at 15, in front.
// The envelope is a backdrop, so it must come first. Anything below 1 works.
export const HULL_RENDER_ORDER = 0

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommunityHull {
  communityId: number
  label: string
  nodeCount: number
  dominantType: string
  color: string
  fillMesh: THREE.Mesh
  wireMesh: THREE.Mesh
}

export interface CommunityHullGroup {
  group: THREE.Group
  hulls: CommunityHull[]
}

export interface CommunityHullOptions extends CommunityHullPrepOptions {
  /** Fill opacity (default COMMUNITY_FILL_OPACITY_REST). */
  fillOpacity?: number
  /** Wireframe opacity (default COMMUNITY_WIRE_OPACITY_REST). */
  wireOpacity?: number
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Inflate a member point outward from the centroid by `expansion`, keeping the
 * hull just larger than the point cloud so node sprites are not clipped by the
 * surface. A point sitting exactly on the centroid cannot be pushed outward —
 * it is returned unchanged.
 */
function inflatePoint(p: { x: number; y: number; z: number }, centroid: { x: number; y: number; z: number }, expansion: number): THREE.Vector3 {
  const dx = p.x - centroid.x
  const dy = p.y - centroid.y
  const dz = p.z - centroid.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-6) return new THREE.Vector3(p.x, p.y, p.z)
  const s = (len + expansion) / len
  return new THREE.Vector3(centroid.x + dx * s, centroid.y + dy * s, centroid.z + dz * s)
}

/** Convex hull of the inflated points, or null when the point set is degenerate. */
function buildHullGeometry(prepared: PreparedCommunityHull): THREE.BufferGeometry | null {
  const points = prepared.points.map((p) => inflatePoint(p, prepared.centroid, prepared.expansion))
  if (points.length < 4) return null
  try {
    return new ConvexGeometry(points)
  } catch (err) {
    console.warn('[CommunityHulls3D] ConvexGeometry error:', err)
    return null
  }
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildCommunityHulls(
  nodes: Graph3DNode[],
  options: CommunityHullOptions = {},
): CommunityHullGroup {
  const { fillOpacity = COMMUNITY_FILL_OPACITY_REST, wireOpacity = COMMUNITY_WIRE_OPACITY_REST } = options
  const group = new THREE.Group()
  group.name = 'communityHulls'
  const hulls: CommunityHull[] = []

  const prepared = prepareCommunityHulls(nodes, options)

  for (const p of prepared) {
    const color = layerColor(p.dominantLayer)
    const hullGeo = buildHullGeometry(p)
    if (!hullGeo) continue

    // Semi-transparent fill — the volume of the cluster, kept faint.
    const fillMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: fillOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const fillMesh = new THREE.Mesh(hullGeo, fillMat)
    fillMesh.renderOrder = HULL_RENDER_ORDER
    fillMesh.userData = { communityId: p.communityId }
    group.add(fillMesh)

    // Wireframe border — the silhouette of the hull, even fainter.
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: wireOpacity,
      wireframe: true,
      depthWrite: false,
    })
    const wireMesh = new THREE.Mesh(hullGeo, wireMat)
    wireMesh.renderOrder = HULL_RENDER_ORDER
    group.add(wireMesh)

    hulls.push({
      communityId: p.communityId,
      label: p.label,
      nodeCount: p.nodeCount,
      dominantType: p.dominantType,
      color,
      fillMesh,
      wireMesh,
    })
  }

  return { group, hulls }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function disposeCommunityHulls(hullGroup: CommunityHullGroup | null) {
  if (!hullGroup) return
  try {
    for (const hull of hullGroup.hulls) {
      hull.fillMesh.geometry.dispose()
      if (hull.fillMesh.material instanceof THREE.Material) hull.fillMesh.material.dispose()
      // wireMesh shares fillMesh.geometry — dispose the material, not the same geometry twice.
      if (hull.wireMesh.material instanceof THREE.Material) hull.wireMesh.material.dispose()
    }
    while (hullGroup.group.children.length > 0) {
      hullGroup.group.remove(hullGroup.group.children[0])
    }
  } catch (err) {
    console.warn('[CommunityHulls3D] dispose error:', err)
  }
}
