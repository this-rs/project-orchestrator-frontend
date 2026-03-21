// ============================================================================
// 3D Graph Layout — Deterministic positioning & stable refresh
// ============================================================================
//
// Key design constraints:
// 1. DETERMINISTIC: Same node IDs → same initial positions (seeded PRNG)
// 2. STABLE ON REFRESH: WebSocket updates don't displace existing nodes
// 3. RELAYOUT THRESHOLD: Only re-simulate if >20% nodes change
// ============================================================================

import { useCallback, useRef } from 'react'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
// Deterministic random number generator — same seed always produces same sequence

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Hash function for node ID → seed ──────────────────────────────────────────
// Simple djb2 hash — fast and produces well-distributed values

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0 // unsigned 32-bit
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Graph3DNode {
  id: string
  label: string
  entityType: string
  layer: string
  // d3-force-3d positions (mutable by the simulation)
  x: number
  y: number
  z: number
  // Fixed positions (pin after drag)
  fx?: number
  fy?: number
  fz?: number
  // Community membership (Louvain cluster)
  communityId?: number
  communityLabel?: string
  // Original data for rendering
  data: Record<string, unknown>
}

export interface Graph3DLink {
  source: string
  target: string
  relationType: string
  layer: string
  weight?: number
  confidence?: number
  count?: number
  color: string
  width: number
  particles: number
  particleSpeed: number
  /** true when source and target belong to different communities */
  isInterCommunity: boolean
  /** community IDs of source/target (for coloring inter-community edges) */
  sourceCommunityId?: number
  targetCommunityId?: number
}

export interface Graph3DData {
  nodes: Graph3DNode[]
  links: Graph3DLink[]
}

// ── Edge style mapping ────────────────────────────────────────────────────────

const LINK_PARTICLES: Record<string, { particles: number; speed: number }> = {
  SYNAPSE: { particles: 2, speed: 0.004 },
  CALLS: { particles: 1, speed: 0.003 },
  IMPORTS: { particles: 0, speed: 0 },
  AFFECTS: { particles: 2, speed: 0.003 },
  TRANSITION: { particles: 2, speed: 0.005 },
  HAS_STATE: { particles: 0, speed: 0 },
  INCLUDES_ENTITY: { particles: 0, speed: 0 },
}

const LINK_COLORS: Record<string, string> = {
  IMPORTS: 'rgba(148, 163, 184, 0.35)',
  CALLS: 'rgba(156, 163, 175, 0.30)',
  EXTENDS: 'rgba(30, 64, 175, 0.45)',
  IMPLEMENTS: 'rgba(67, 56, 202, 0.40)',
  TOUCHES: 'rgba(134, 239, 172, 0.35)',
  CO_CHANGED: 'rgba(254, 215, 170, 0.30)',
  CO_CHANGED_TRANSITIVE: 'rgba(253, 186, 116, 0.25)',
  AFFECTS: 'rgba(168, 85, 247, 0.50)',
  DISCUSSED: 'rgba(209, 213, 219, 0.25)',
  LINKED_TO: 'rgba(156, 163, 175, 0.25)',
  SYNAPSE: 'rgba(34, 211, 238, 0.50)',
  HAS_MEMBER: 'rgba(249, 168, 212, 0.30)',
  CONTAINS: 'rgba(16, 185, 129, 0.35)',
  DEPENDS_ON: 'rgba(245, 158, 11, 0.40)',
  INFORMED_BY: 'rgba(139, 92, 246, 0.35)',
  HAS_STATE: 'rgba(249, 115, 22, 0.35)',
  TRANSITION: 'rgba(234, 88, 12, 0.45)',
  BELONGS_TO_SKILL: 'rgba(251, 146, 60, 0.30)',
  INCLUDES_ENTITY: 'rgba(232, 121, 249, 0.30)',
  // PM plan graph relations
  HAS_TASK: 'rgba(16, 185, 129, 0.40)',
  HAS_CONSTRAINT: 'rgba(220, 38, 38, 0.35)',
  HAS_DECISION: 'rgba(139, 92, 246, 0.40)',
  HAS_FEATURE_GRAPH: 'rgba(232, 121, 249, 0.40)',
}

const LINK_WIDTHS: Record<string, number> = {
  IMPORTS: 0.6,
  CALLS: 0.4,
  EXTENDS: 0.8,
  IMPLEMENTS: 0.6,
  AFFECTS: 1.0,
  SYNAPSE: 0.8,
  CO_CHANGED: 0.5,
  CO_CHANGED_TRANSITIVE: 0.3,
  LINKED_TO: 0.4,
  HAS_MEMBER: 0.4,
  HAS_STATE: 0.6,
  TRANSITION: 0.8,
  BELONGS_TO_SKILL: 0.4,
  INCLUDES_ENTITY: 0.4,
  // PM plan graph relations
  HAS_TASK: 0.8,
  HAS_CONSTRAINT: 0.5,
  HAS_DECISION: 0.6,
  HAS_FEATURE_GRAPH: 0.6,
  DISCUSSED: 0.4,
  DEPENDS_ON: 0.7,
  CONTAINS: 0.5,
}

// ── Spread radius by layer ────────────────────────────────────────────────────
// Nodes in different layers get different z-range to separate them visually

const LAYER_Z_OFFSET: Record<string, number> = {
  code: 0,
  fabric: 0,     // same z-plane as code (structural)
  knowledge: 80,
  neural: 120,
  skills: 160,
  behavioral: 200, // protocols & FSM states above skills
  pm: -80,
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const RELAYOUT_THRESHOLD = 0.2 // 20% change triggers relayout
const SPREAD_RADIUS = 200

export function useGraph3DLayout() {
  // Cache positions for stable refresh
  const positionCache = useRef<Map<string, { x: number; y: number; z: number }>>(new Map())
  const previousNodeIds = useRef<Set<string>>(new Set())

  /**
   * Compute deterministic initial position for a node.
   * Uses mulberry32 PRNG seeded by hash of node ID.
   */
  const computeInitialPosition = useCallback((nodeId: string, layer: string) => {
    const seed = hashString(nodeId)
    const rng = mulberry32(seed)
    const zOffset = LAYER_Z_OFFSET[layer] ?? 0

    // Spherical coordinates for even distribution
    const theta = rng() * Math.PI * 2
    const phi = Math.acos(2 * rng() - 1)
    const r = SPREAD_RADIUS * Math.cbrt(rng()) // cube root for uniform volume distribution

    return {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi) + zOffset,
    }
  }, [])

  /**
   * Transform IntelligenceNodes/Edges → Graph3DData.
   * Returns whether a relayout is needed (true if >20% nodes changed).
   */
  const transformToGraph3D = useCallback((
    nodes: IntelligenceNode[],
    edges: IntelligenceEdge[],
  ): { data: Graph3DData; needsRelayout: boolean } => {
    const currentIds = new Set(nodes.map((n) => n.id))
    const prevIds = previousNodeIds.current

    // Compute change ratio
    const added = [...currentIds].filter((id) => !prevIds.has(id))
    const removed = [...prevIds].filter((id) => !currentIds.has(id))
    const changeRatio = prevIds.size > 0
      ? (added.length + removed.length) / Math.max(prevIds.size, currentIds.size)
      : 1 // first load → always layout

    const needsRelayout = changeRatio >= RELAYOUT_THRESHOLD

    // Remove cached positions for removed nodes
    for (const id of removed) {
      positionCache.current.delete(id)
    }

    // Build 3D nodes
    const graph3dNodes: Graph3DNode[] = nodes.map((node) => {
      const data = node.data as Record<string, unknown>
      const entityType = (data.entityType as string) ?? 'file'
      const layer = (data.layer as string) ?? 'code'

      // Use cached position if available, otherwise compute deterministic initial
      let pos = positionCache.current.get(node.id)
      if (!pos) {
        pos = computeInitialPosition(node.id, layer)
        positionCache.current.set(node.id, pos)
      }

      return {
        id: node.id,
        label: (data.label as string) ?? node.id,
        entityType,
        layer,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        communityId: data.communityId as number | undefined,
        communityLabel: data.communityLabel as string | undefined,
        data,
      }
    })

    // Build community lookup for inter-community edge detection
    const communityMap = new Map<string, number>()
    for (const n of graph3dNodes) {
      if (n.communityId != null) communityMap.set(n.id, n.communityId)
    }

    // Build 3D links
    const nodeIdSet = currentIds
    const graph3dLinks: Graph3DLink[] = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((edge) => {
        const relationType = (edge.data?.relationType as string) ?? 'IMPORTS'
        const particleConfig = LINK_PARTICLES[relationType] ?? { particles: 0, speed: 0 }
        const srcCommunity = communityMap.get(edge.source)
        const tgtCommunity = communityMap.get(edge.target)
        const isInterCommunity = srcCommunity != null && tgtCommunity != null && srcCommunity !== tgtCommunity
        return {
          source: edge.source,
          target: edge.target,
          relationType,
          layer: (edge.data?.layer as string) ?? 'fabric',
          weight: edge.data?.weight as number | undefined,
          confidence: edge.data?.confidence as number | undefined,
          count: edge.data?.count as number | undefined,
          color: LINK_COLORS[relationType] ?? '#6B7280',
          width: LINK_WIDTHS[relationType] ?? 1,
          particles: particleConfig.particles,
          particleSpeed: particleConfig.speed,
          isInterCommunity,
          sourceCommunityId: srcCommunity,
          targetCommunityId: tgtCommunity,
        }
      })

    // Update tracking
    previousNodeIds.current = currentIds

    return {
      data: { nodes: graph3dNodes, links: graph3dLinks },
      needsRelayout,
    }
  }, [computeInitialPosition])

  /**
   * Update position cache after simulation settles.
   * Called from onEngineStop to persist computed positions.
   */
  const savePositions = useCallback((nodes: Graph3DNode[]) => {
    for (const node of nodes) {
      if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
        positionCache.current.set(node.id, { x: node.x, y: node.y, z: node.z })
      }
    }
  }, [])

  /**
   * Reset position cache (force full relayout next time).
   */
  const resetPositions = useCallback(() => {
    positionCache.current.clear()
    previousNodeIds.current.clear()
  }, [])

  return {
    transformToGraph3D,
    savePositions,
    resetPositions,
  }
}
