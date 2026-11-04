// ============================================================================
// CommunityRings3D — two thin rings that show a community's internal hierarchy
// ============================================================================
//
// Draws, for each community at the aggregated tier, two faint circles in the
// group's best-fit plane: the p50 ring (half the members inside — the core) and
// the p90 ring (90 % inside — the halo). The radii come from the pure
// `prepareCommunityRings`; this module only turns its output into three.js
// LineLoops. The plane is the least-squares fit through the members (the
// covariance's smallest eigenvector is the normal), so the rings lie flat in
// the disc the members actually span rather than a guess.
//
// Both rings are deliberately faint (opacity ≈ 0.07), `depthWrite: false`, and
// render BEFORE the nodes (renderOrder < nodes) so the nodes always stay in
// front. Each ring is ONE object (a LineLoop of 64 segments), and the whole
// set is built once per layout — never in the render loop.
// ============================================================================

import * as THREE from 'three'
import { layerColor } from './layerColors'
import {
  prepareCommunityRings,
  type PreparedCommunityRing,
  type CommunityRingPrepOptions,
  type RingMember,
} from './communityRings'
import type { Graph3DNode } from './useGraph3DLayout'

// ── Render order ────────────────────────────────────────────────────────────
// Nodes (THREE.Points) render at NODE_POINTS_RENDER_ORDER = 10, links at 15, the
// hull envelope at 0. The rings sit inside the envelope and must also come
// before the nodes; 0 keeps them on the envelope's tier.
export const RING_RENDER_ORDER = 0

/** Segments of one circle. 64 is more than enough for a faint, hair-thin ring. */
export const RING_SEGMENTS = 64

/** Rest opacity of one ring (the task's 0.05–0.10 band). */
export const RING_OPACITY = 0.07

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommunityRing {
  communityId: number
  label: string
  nodeCount: number
  color: string
  p50: THREE.LineLoop
  p90: THREE.LineLoop
}

export interface CommunityRingGroup {
  group: THREE.Group
  rings: CommunityRing[]
}

export interface CommunityRingOptions extends CommunityRingPrepOptions {
  /** Ring opacity (default RING_OPACITY). */
  opacity?: number
  /** Segments per circle (default RING_SEGMENTS). */
  segments?: number
}

// ── Plane fit ────────────────────────────────────────────────────────────────

/**
 * Smallest eigenvector of a symmetric 3×3 matrix (Jacobi rotations). This is
 * the normal of the least-squares plane through the members: the direction of
 * least spread. Deterministic, no three.js — a tiny self-contained solver.
 */
function smallestEigenvector(m: readonly number[]): THREE.Vector3 {
  // m = [m00, m01, m02, m11, m12, m22]
  const a = [
    [m[0], m[1], m[2]],
    [m[1], m[3], m[4]],
    [m[2], m[4], m[5]],
  ]
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0
    let p = 0
    let q = 1
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const o = Math.abs(a[i][j])
        if (o > off) {
          off = o
          p = i
          q = j
        }
      }
    }
    if (off < 1e-12) break
    const apq = a[p][q]
    const app = a[p][p]
    const aqq = a[q][q]
    const theta = (aqq - app) / (2 * apq)
    const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
    const c = 1 / Math.sqrt(t * t + 1)
    const s = t * c
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p]
      const akq = a[k][q]
      a[k][p] = c * akp - s * akq
      a[k][q] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k]
      const aqk = a[q][k]
      a[p][k] = c * apk - s * aqk
      a[q][k] = s * apk + c * aqk
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p]
      const vkq = v[k][q]
      v[k][p] = c * vkp - s * vkq
      v[k][q] = s * vkp + c * vkq
    }
  }
  let idx = 0
  if (a[1][1] < a[idx][idx]) idx = 1
  if (a[2][2] < a[idx][idx]) idx = 2
  return new THREE.Vector3(v[0][idx], v[1][idx], v[2][idx]).normalize()
}

/** Two orthonormal vectors spanning the group's best-fit plane, plus its normal. */
function fitPlane(points: readonly RingMember[], centroid: RingMember): { u: THREE.Vector3; v: THREE.Vector3 } {
  const c = new THREE.Vector3(centroid.x, centroid.y, centroid.z)
  let m00 = 0
  let m01 = 0
  let m02 = 0
  let m11 = 0
  let m12 = 0
  let m22 = 0
  for (const p of points) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const dz = p.z - c.z
    m00 += dx * dx
    m01 += dx * dy
    m02 += dx * dz
    m11 += dy * dy
    m12 += dy * dz
    m22 += dz * dz
  }
  const normal = smallestEigenvector([m00, m01, m02, m11, m12, m22])
  // Pick a reference axis not parallel to the normal, then build a basis.
  const ref = new THREE.Vector3(1, 0, 0)
  if (Math.abs(normal.dot(ref)) > 0.9) ref.set(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(ref, normal).normalize()
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()
  return { u, v }
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** One closed circle of `segments` segments, in the plane (u, v), centred on `centroid`. */
function buildRing(
  prepared: PreparedCommunityRing,
  radius: number,
  plane: { u: THREE.Vector3; v: THREE.Vector3 },
  color: THREE.Color,
  opacity: number,
  segments: number,
): THREE.LineLoop {
  const c = new THREE.Vector3(prepared.centroid.x, prepared.centroid.y, prepared.centroid.z)
  const positions = new Float32Array(segments * 3)
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2
    const cos = Math.cos(th)
    const sin = Math.sin(th)
    positions[i * 3] = c.x + radius * (plane.u.x * cos + plane.v.x * sin)
    positions[i * 3 + 1] = c.y + radius * (plane.u.y * cos + plane.v.y * sin)
    positions[i * 3 + 2] = c.z + radius * (plane.u.z * cos + plane.v.z * sin)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const line = new THREE.LineLoop(geometry, material)
  line.renderOrder = RING_RENDER_ORDER
  line.frustumCulled = false
  line.userData = { communityId: prepared.communityId }
  return line
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildCommunityRings(
  nodes: Graph3DNode[],
  options: CommunityRingOptions = {},
): CommunityRingGroup {
  const { opacity = RING_OPACITY, segments = RING_SEGMENTS } = options
  const group = new THREE.Group()
  group.name = 'communityRings'
  const rings: CommunityRing[] = []

  const prepared = prepareCommunityRings(nodes, options)

  for (const p of prepared) {
    const colorHex = layerColor(p.dominantLayer)
    const color = new THREE.Color(colorHex)
    const plane = fitPlane(p.points, p.centroid)
    const p50 = buildRing(p, p.p50, plane, color, opacity, segments)
    const p90 = buildRing(p, p.p90, plane, color, opacity, segments)
    group.add(p50)
    group.add(p90)
    rings.push({
      communityId: p.communityId,
      label: p.label,
      nodeCount: p.nodeCount,
      color: colorHex,
      p50,
      p90,
    })
  }

  return { group, rings }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function disposeCommunityRings(ringGroup: CommunityRingGroup | null) {
  if (!ringGroup) return
  try {
    for (const ring of ringGroup.rings) {
      ring.p50.geometry.dispose()
      ring.p90.geometry.dispose()
      if (ring.p50.material instanceof THREE.Material) ring.p50.material.dispose()
      if (ring.p90.material instanceof THREE.Material) ring.p90.material.dispose()
    }
    while (ringGroup.group.children.length > 0) {
      ringGroup.group.remove(ringGroup.group.children[0])
    }
  } catch (err) {
    console.warn('[CommunityRings3D] dispose error:', err)
  }
}
