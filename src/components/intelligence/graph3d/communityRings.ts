// ============================================================================
// communityRings — the pure radius arithmetic of a community's internal rings
// ============================================================================
//
// The CONSTELLATION view wraps each community in a translucent convex hull, but
// a hull is a silhouette: it says "here is a cluster", not "how is this cluster
// organised". Two thin rings drawn around the centroid answer the second
// question with nothing more than the members' positions:
//
//   • p50 — the radius that contains HALF the members (the dense CORE);
//   • p90 — the radius that contains 90 % of the members (the outer HALO).
//
// Both are QUANTILES of the member distances to the centroid, and both are
// clamped so a ring is never wider than the community itself (its radius = the
// farthest member) and never thinner than a readable floor (a fraction of that
// radius). The module is pure and deterministic — no three.js, no WebGL. The
// circles are built in CommunityRings3D.tsx, which also selects which
// communities deserve rings (≥ MIN_RING_MEMBERS, the biggest MAX_RINGS first,
// the same bounds as the hulls).
// ============================================================================

import type { Graph3DNode } from './useGraph3DLayout'
import { dominantLayer } from './layerColors'

/** A community with fewer members than this is too small to ring (same floor as the hulls). */
export const MIN_RING_MEMBERS = 20

/** At most this many communities get rings, the biggest first (same cap as the hulls). */
export const MAX_RINGS = 40

/** A ring is never drawn thinner than this fraction of the community's radius. */
export const RING_FLOOR_RATIO = 0.15

/** The p50 ring: the radius that contains this fraction of the members. */
export const RING_P50 = 0.5

/** The p90 ring: the radius that contains this fraction of the members. */
export const RING_P90 = 0.9

/** A positioned member — anything with x/y/z is enough for the arithmetic. */
export interface RingMember {
  x: number
  y: number
  z: number
}

/** The two radii of one community's rings, plus the geometry they sit on. */
export interface CommunityRings {
  /** Radius containing half the members (clamped ≥ floor, ≤ radius). */
  p50: number
  /** Radius containing 90 % of the members (clamped ≥ floor, ≤ radius). */
  p90: number
  /** Farthest member distance from the centroid — the community's radius (p100). */
  radius: number
  /** Centroid of the members' positions (the rings' shared centre). */
  centroid: RingMember
  /** Number of finite members the quantiles were computed over. */
  nodeCount: number
}

function isFiniteMember(m: RingMember): boolean {
  return Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)
}

/**
 * Nearest-rank quantile of a SORTED ascending distance array: the smallest
 * radius that contains at least `q` × n members. For q = 0.5 the index is
 * ⌈n/2⌉ − 1, i.e. the median member's distance, so exactly ⌈n/2⌉ members sit
 * at or inside the returned radius.
 */
function quantile(sorted: readonly number[], q: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))
  return sorted[idx]
}

/**
 * Two radii that expose a community's internal hierarchy, from the members'
 * positions alone.
 *
 *   • centroid = mean of the finite members;
 *   • distanceᵢ = |memberᵢ − centroid|;
 *   • radius   = max(distanceᵢ) — the community's own radius (p100);
 *   • p50      = clamp(quantile(distance, RING_P50), floor, radius);
 *   • p90      = clamp(quantile(distance, RING_P90), floor, radius);
 *   • floor    = radius × RING_FLOOR_RATIO — a ring is never a dot.
 *
 * Fewer than 3 finite members cannot define a plane (two points are a line, not
 * a ring), so the result is null and the caller draws nothing. The clamp is
 * monotonic and the quantiles are ordered, so p50 ≤ p90 always holds.
 */
export function communityRings(members: readonly RingMember[]): CommunityRings | null {
  const pts: RingMember[] = []
  for (const m of members) if (isFiniteMember(m)) pts.push(m)
  if (pts.length < 3) return null

  const centroid: RingMember = { x: 0, y: 0, z: 0 }
  for (const p of pts) {
    centroid.x += p.x
    centroid.y += p.y
    centroid.z += p.z
  }
  centroid.x /= pts.length
  centroid.y /= pts.length
  centroid.z /= pts.length

  const dists: number[] = new Array(pts.length)
  let radius = 0
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - centroid.x
    const dy = pts[i].y - centroid.y
    const dz = pts[i].z - centroid.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    dists[i] = d
    if (d > radius) radius = d
  }
  dists.sort((a, b) => a - b)

  const floor = radius * RING_FLOOR_RATIO
  const clamp = (v: number) => Math.min(radius, Math.max(floor, v))

  return {
    p50: clamp(quantile(dists, RING_P50)),
    p90: clamp(quantile(dists, RING_P90)),
    radius,
    centroid,
    nodeCount: pts.length,
  }
}

// ── Selection (which communities, how many) ─────────────────────────────────

export interface CommunityRingPrepOptions {
  /** Skip communities with fewer members than this (default MIN_RING_MEMBERS). */
  minMembers?: number
  /** Draw at most this many communities, biggest first (default MAX_RINGS). */
  maxRings?: number
}

/** One community's rings, ready for the 3D builder. */
export interface PreparedCommunityRing extends CommunityRings {
  communityId: number
  label: string
  dominantLayer: string
  /** Finite member positions — the 3D builder fits the group plane on them. */
  points: RingMember[]
}

/**
 * Turn a positioned node set into the list of communities that deserve a pair
 * of rings. Deterministic: same input → same output (Map keeps first-seen order,
 * the size sort is tie-broken on `communityId`). Selection mirrors the hulls —
 * the same two bounds (min members, max count) so a ring never appears where
 * there is no envelope.
 */
export function prepareCommunityRings(
  nodes: Graph3DNode[],
  options: CommunityRingPrepOptions = {},
): PreparedCommunityRing[] {
  const { minMembers = MIN_RING_MEMBERS, maxRings = MAX_RINGS } = options

  const groups = new Map<number, { label: string; members: Graph3DNode[] }>()
  for (const node of nodes) {
    if (node.communityId == null) continue
    let g = groups.get(node.communityId)
    if (!g) {
      g = { label: node.communityLabel ?? '', members: [] }
      groups.set(node.communityId, g)
    }
    if (!g.label && node.communityLabel) g.label = node.communityLabel
    g.members.push(node)
  }

  const prepared: PreparedCommunityRing[] = []
  for (const [communityId, { label, members }] of groups) {
    const points: RingMember[] = []
    for (const m of members) if (isFiniteMember(m)) points.push({ x: m.x, y: m.y, z: m.z })
    if (points.length < minMembers) continue

    const rings = communityRings(points)
    if (!rings) continue

    prepared.push({
      communityId,
      label: label || `#${communityId}`,
      dominantLayer: dominantLayer(members.map((n) => n.layer)),
      points,
      ...rings,
    })
  }

  prepared.sort((a, b) => b.nodeCount - a.nodeCount || a.communityId - b.communityId)
  return prepared.slice(0, maxRings)
}
