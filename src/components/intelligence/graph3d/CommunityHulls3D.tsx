// ============================================================================
// CommunityHulls3D — Convex hull overlays for community clusters in 3D graph
// ============================================================================
//
// Renders semi-transparent convex hull meshes around nodes that share the same
// communityId. Each hull gets a unique color, a wireframe border, and a floating
// label at the centroid.
//
// Safety: all geometry construction is wrapped in try-catch to prevent
// Three.js errors from crashing the entire graph component.
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import type { Graph3DNode } from './useGraph3DLayout'

// ── Community colors — 12 distinct hues ──────────────────────────────────────

const COMMUNITY_COLORS = [
  '#3B82F6', // blue
  '#22C55E', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#EF4444', // red
  '#14B8A6', // teal
  '#F97316', // orange
  '#A855F7', // purple
  '#84CC16', // lime
  '#E879F9', // fuchsia
]

function getCommunityColor(communityId: number): string {
  return COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
}

// ── Convex Hull geometry (fan triangulation from centroid) ────────────────────

function buildConvexHullGeometry(positions: THREE.Vector3[]): THREE.BufferGeometry | null {
  if (positions.length < 3) return null

  // Check for degenerate case: all points too close together
  const center = new THREE.Vector3()
  positions.forEach((p) => center.add(p))
  center.divideScalar(positions.length)

  const maxDist = Math.max(...positions.map((p) => p.distanceTo(center)))
  if (maxDist < 1) return null // all points collapsed — skip

  if (positions.length === 3) {
    const geo = new THREE.BufferGeometry()
    const verts = new Float32Array(9)
    positions.forEach((p, i) => {
      verts[i * 3] = p.x
      verts[i * 3 + 1] = p.y
      verts[i * 3 + 2] = p.z
    })
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex([0, 1, 2, 2, 1, 0]) // double-sided triangle
    geo.computeVertexNormals()
    return geo
  }

  try {
    const vertices: number[] = []
    const indices: number[] = []

    // Vertex 0 = centroid
    vertices.push(center.x, center.y, center.z)

    // Add all hull points
    for (const p of positions) {
      vertices.push(p.x, p.y, p.z)
    }

    // Sort points by angle relative to centroid (projected onto XZ plane)
    const sorted = positions.map((p, i) => ({
      idx: i + 1,
      angle: Math.atan2(p.z - center.z, p.x - center.x),
    })).sort((a, b) => a.angle - b.angle)

    // Fan triangles from centroid
    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length
      indices.push(0, sorted[i].idx, sorted[next].idx)
    }

    if (indices.length === 0) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  } catch (err) {
    console.warn('[CommunityHulls3D] geometry error:', err)
    return null
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommunityHull {
  communityId: number
  label: string
  nodeCount: number
  color: string
  fillMesh: THREE.Mesh
  wireMesh: THREE.Mesh
  labelSprite: THREE.Object3D
}

export interface CommunityHullGroup {
  group: THREE.Group
  hulls: CommunityHull[]
}

// ── Build community hulls from positioned Graph3D nodes ─────────────────────

export function buildCommunityHulls(
  nodes: Graph3DNode[],
): CommunityHullGroup {
  const group = new THREE.Group()
  group.name = 'communityHulls'
  const hulls: CommunityHull[] = []

  try {
    // Group nodes by communityId
    const communities = new Map<number, { nodes: Graph3DNode[]; label: string }>()

    for (const node of nodes) {
      if (node.communityId == null) continue

      if (!communities.has(node.communityId)) {
        communities.set(node.communityId, {
          nodes: [],
          label: node.communityLabel ?? `Community ${node.communityId}`,
        })
      }
      communities.get(node.communityId)!.nodes.push(node)
    }

    for (const [communityId, { nodes: communityNodes, label }] of communities) {
      // Need at least 3 nodes for a meaningful hull
      if (communityNodes.length < 3) continue

      const color = getCommunityColor(communityId)

      // Collect 3D positions — skip nodes with no valid position
      const positions = communityNodes
        .filter((n) => isFinite(n.x) && isFinite(n.y) && isFinite(n.z))
        .map((n) => new THREE.Vector3(n.x, n.y, n.z))

      if (positions.length < 3) continue

      // Compute centroid
      const centroid = new THREE.Vector3()
      positions.forEach((p) => centroid.add(p))
      centroid.divideScalar(positions.length)

      // Expand hull outward for visual breathing room
      // Guard against zero-length direction vectors (node exactly at centroid)
      const expanded = positions.map((p) => {
        const dir = p.clone().sub(centroid)
        const len = dir.length()
        if (len < 0.01) return p.clone() // don't expand collapsed points
        return p.clone().add(dir.normalize().multiplyScalar(20))
      })

      const hullGeo = buildConvexHullGeometry(expanded)
      if (!hullGeo) continue

      // Semi-transparent fill
      const fillMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const fillMesh = new THREE.Mesh(hullGeo, fillMat)
      fillMesh.userData = { communityId }
      group.add(fillMesh)

      // Wireframe border
      const wireMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.25,
        wireframe: true,
      })
      const wireMesh = new THREE.Mesh(hullGeo.clone(), wireMat)
      group.add(wireMesh)

      // Label at centroid
      try {
        const labelSprite = new SpriteText(label)
        labelSprite.color = color
        labelSprite.textHeight = 8
        labelSprite.backgroundColor = 'rgba(15, 23, 42, 0.75)'
        labelSprite.padding = [2, 1]
        labelSprite.borderRadius = 3
        labelSprite.borderWidth = 0.5
        labelSprite.borderColor = color
        labelSprite.position.copy(centroid)
        labelSprite.position.y += 25
        group.add(labelSprite as unknown as THREE.Object3D)

        hulls.push({
          communityId,
          label,
          nodeCount: communityNodes.length,
          color,
          fillMesh,
          wireMesh,
          labelSprite: labelSprite as unknown as THREE.Object3D,
        })
      } catch (err) {
        console.warn('[CommunityHulls3D] SpriteText error:', err)
        // Still add the hull meshes without a label
        hulls.push({
          communityId,
          label,
          nodeCount: communityNodes.length,
          color,
          fillMesh,
          wireMesh,
          labelSprite: new THREE.Object3D(), // placeholder
        })
      }
    }
  } catch (err) {
    console.error('[CommunityHulls3D] buildCommunityHulls error:', err)
  }

  return { group, hulls }
}

// ── Cleanup helper ──────────────────────────────────────────────────────────

export function disposeCommunityHulls(hullGroup: CommunityHullGroup | null) {
  if (!hullGroup) return
  try {
    for (const hull of hullGroup.hulls) {
      hull.fillMesh.geometry.dispose()
      if (hull.fillMesh.material instanceof THREE.Material) hull.fillMesh.material.dispose()
      hull.wireMesh.geometry.dispose()
      if (hull.wireMesh.material instanceof THREE.Material) hull.wireMesh.material.dispose()
    }
    while (hullGroup.group.children.length > 0) {
      hullGroup.group.remove(hullGroup.group.children[0])
    }
  } catch (err) {
    console.warn('[CommunityHulls3D] dispose error:', err)
  }
}
