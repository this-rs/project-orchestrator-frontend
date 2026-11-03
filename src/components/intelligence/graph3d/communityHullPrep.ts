// ============================================================================
// communityHullPrep — pure preparation of community-hull points (no three.js)
// ============================================================================
//
// Decides WHICH communities get a translucent envelope and prepares their
// points for the convex-hull builder. Pure and deterministic: no WebGL, no
// three.js — the geometry itself is built in CommunityHulls3D.tsx.
//
// The selection logic (which clusters, how many, how far to inflate) is the
// part that changes with the data and the part a screen cannot prove — so it
// lives here, where CI can assert the bounds without a GPU:
//   • a community under MIN_HULL_MEMBERS is too small to wrap (degenerate);
//   • at most MAX_HULLS envelopes are drawn, the biggest first;
//   • each point is inflated outward by HULL_EXPANSION_RATIO of the community
//     radius (8 %), so the hull swallows the nodes without eating the scene.
// ============================================================================

import type { Graph3DNode } from './useGraph3DLayout'
import { dominantLayer } from './layerColors'

/** A community is too small to wrap — a hull over fewer than this many points is degenerate. */
export const MIN_HULL_MEMBERS = 20

/** At most this many envelopes are drawn, the biggest first, to bound the cost. */
export const MAX_HULLS = 40

/** The hull is inflated by this fraction of the community's radius (8 %). */
export const HULL_EXPANSION_RATIO = 0.08

export interface HullPoint {
  x: number
  y: number
  z: number
}

export interface PreparedCommunityHull {
  /** Community id the nodes share (0 = biggest group at the aggregated tier). */
  communityId: number
  /** Human-readable group label (community or directory name). */
  label: string
  /** Number of members with a valid position (what actually forms the hull). */
  nodeCount: number
  /** Most common entity type among the members — drives the envelope colour. */
  dominantType: string
  /** Layer with the most members (ties → alphabetical) — drives the envelope colour. */
  dominantLayer: string
  /** Member positions (finite-only), in stable input order. */
  points: HullPoint[]
  /** Centroid of the member positions. */
  centroid: HullPoint
  /** Farthest member distance from the centroid (the community's radius). */
  radius: number
  /** Outward inflation applied to each point = radius × expansionRatio. */
  expansion: number
}

export interface CommunityHullPrepOptions {
  /** Skip communities with fewer members than this (default MIN_HULL_MEMBERS). */
  minMembers?: number
  /** Draw at most this many envelopes, biggest first (default MAX_HULLS). */
  maxHulls?: number
  /** Inflation fraction of the community radius (default HULL_EXPANSION_RATIO). */
  expansionRatio?: number
}

function isFiniteNode(n: Graph3DNode): boolean {
  return Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)
}

/**
 * Turn a positioned node set into the list of communities that deserve an
 * envelope. Deterministic: same input → same output (Map keeps first-seen
 * order, the size sort is tie-broken on `communityId`).
 */
export function prepareCommunityHulls(
  nodes: Graph3DNode[],
  options: CommunityHullPrepOptions = {},
): PreparedCommunityHull[] {
  const {
    minMembers = MIN_HULL_MEMBERS,
    maxHulls = MAX_HULLS,
    expansionRatio = HULL_EXPANSION_RATIO,
  } = options

  // Group members by community, keeping first-seen order for the label.
  const groups = new Map<number, { label: string; nodes: Graph3DNode[] }>()
  for (const node of nodes) {
    if (node.communityId == null) continue
    let g = groups.get(node.communityId)
    if (!g) {
      g = { label: node.communityLabel ?? '', nodes: [] }
      groups.set(node.communityId, g)
    }
    if (!g.label && node.communityLabel) g.label = node.communityLabel
    g.nodes.push(node)
  }

  const prepared: PreparedCommunityHull[] = []

  for (const [communityId, { label, nodes: members }] of groups) {
    // Only finite positions participate in the hull.
    const points: HullPoint[] = []
    for (const n of members) {
      if (isFiniteNode(n)) points.push({ x: n.x, y: n.y, z: n.z })
    }
    // Bound 1: a hull over fewer than `minMembers` points is degenerate.
    if (points.length < minMembers) continue

    // Centroid, then radius = farthest member.
    const centroid: HullPoint = { x: 0, y: 0, z: 0 }
    for (const p of points) {
      centroid.x += p.x
      centroid.y += p.y
      centroid.z += p.z
    }
    centroid.x /= points.length
    centroid.y /= points.length
    centroid.z /= points.length

    let radius = 0
    for (const p of points) {
      const dx = p.x - centroid.x
      const dy = p.y - centroid.y
      const dz = p.z - centroid.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d > radius) radius = d
    }

    // Dominant entity type (mode). First-seen breaks ties deterministically.
    const typeCounts = new Map<string, number>()
    let dominantType = 'file'
    let dominantN = -1
    for (const n of members) {
      const t = n.entityType
      const c = (typeCounts.get(t) ?? 0) + 1
      typeCounts.set(t, c)
      if (c > dominantN) {
        dominantN = c
        dominantType = t
      }
    }

    prepared.push({
      communityId,
      label: label || `#${communityId}`,
      nodeCount: points.length,
      dominantType,
      dominantLayer: dominantLayer(members.map((n) => n.layer)),
      points,
      centroid,
      radius,
      expansion: radius * expansionRatio,
    })
  }

  // Bound 2: at most `maxHulls`, biggest first. Tie-break on id for determinism.
  prepared.sort((a, b) => b.nodeCount - a.nodeCount || a.communityId - b.communityId)

  return prepared.slice(0, maxHulls)
}
