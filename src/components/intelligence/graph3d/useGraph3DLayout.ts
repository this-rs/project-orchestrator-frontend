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
  /// What the placement groups on. Falls back to the file's directory when the
  /// project has no GDS analytics, so a layer is never ONE anonymous ball.
  groupKey?: string
  /// Edges touching this node. Size and core position both key on it, in the
  /// 3D as in the code map: the same grammar in both views.
  degree?: number
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

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** The file a node belongs to: `file_path` on a symbol, `path` on a file. */
function asPath(d: Record<string, unknown>): string | undefined {
  const p = d.file_path ?? d.path
  return typeof p === 'string' && p.length > 0 ? p : undefined
}

function asCommunityLabel(d: Record<string, unknown>): string | undefined {
  const l = d.community_label ?? d.communityLabel
  return typeof l === 'string' && l.length > 0 ? l : undefined
}

function directoryOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '.'
}

/** Deterministic 32-bit hash (FNV-1a): the same group name always seeds the same shape. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded PRNG (Mulberry32): a nebula is irregular, but it must not move between renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * File path → community, read from the nodes that carry one.
 *
 * The API names the field in snake_case (`community_id`, `community_label`) on
 * file nodes and gives a symbol its owning file (`file_path`). Reading only
 * `communityId` left EVERY node in one anonymous group, so the placement drew
 * one regular ball per layer and the communities — the very thing the view
 * exists to show — were invisible.
 */
export function communityIndex(
  nodes: IntelligenceNode[],
): Map<string, { id: number; label?: string }> {
  const byPath = new Map<string, { id: number; label?: string }>()
  for (const node of nodes) {
    const d = node.data as Record<string, unknown>
    const id = asNumber(d.community_id ?? d.communityId)
    if (id == null) continue
    const path = asPath(d) ?? (d.entityType === 'file' ? node.id : undefined)
    if (path) byPath.set(path, { id, label: asCommunityLabel(d) })
  }
  return byPath
}

/**
 * One node, with the community it BELONGS to: its own, or the one of the file
 * it lives in. `groupKey` is what the placement groups on — the community when
 * there is one, the file's directory otherwise (a project with no GDS analytics
 * still gets neighbours together instead of one bucket per layer).
 */
export function toGraph3DNode(
  node: IntelligenceNode,
  communityByPath: Map<string, { id: number; label?: string }>,
  pos?: { x: number; y: number; z: number },
): Graph3DNode {
  const data = node.data as Record<string, unknown>
  const entityType = (data.entityType as string) ?? 'file'
  const layer = (data.layer as string) ?? 'code'
  const own = asNumber(data.community_id ?? data.communityId)
  const path = asPath(data) ?? (entityType === 'file' ? node.id : undefined)
  const inherited = own == null && path ? communityByPath.get(path) : undefined
  const communityId = own ?? inherited?.id
  const communityLabel = asCommunityLabel(data) ?? inherited?.label
  return {
    id: node.id,
    label: (data.label as string) ?? node.id,
    entityType,
    layer,
    x: pos?.x ?? 0,
    y: pos?.y ?? 0,
    z: pos?.z ?? 0,
    communityId,
    communityLabel,
    groupKey:
      communityId != null ? `c${communityId}` : path ? `d${directoryOf(path)}` : undefined,
    data,
  }
}

/** Per-layer angular phase for the community ring (keeps layers from overlapping). */
const LAYER_ANGLE: Record<string, number> = {
  code: 0,
  fabric: 0.4,
  pm: 3.1,
  knowledge: 0.8,
  neural: 1.4,
  skills: 2.0,
  behavioral: 2.6,
}

const DOUBLE_SEP = '\u0001'
const GOLDEN_ANGLE = 2.39996

/**
 * Deterministic O(N log N) placement — the po-graph technique.
 *
 * Nodes are grouped by (layer, community) and laid on a Fermat spiral over a
 * sphere per group, the group spheres spread on a ring inside the layer's
 * z-plane. No force simulation: the layout is complete the instant it is
 * computed, sorted by degree so the busiest nodes sit near each group's pole.
 * Same input ⇒ same output (stable across refreshes).
 */
export function deterministicPlacement(
  nodes: Graph3DNode[],
  edges: IntelligenceEdge[],
): Map<string, { x: number; y: number; z: number }> {
  const out = new Map<string, { x: number; y: number; z: number }>()
  if (nodes.length === 0) return out

  // Degree (importance proxy) straight from the edges.
  const deg = new Map<string, number>()
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }

  // Group by layer + community.
  const groups = new Map<string, Graph3DNode[]>()
  for (const n of nodes) {
    const key = n.layer + DOUBLE_SEP + (n.groupKey ?? String(n.communityId ?? 0))
    const g = groups.get(key)
    if (g) g.push(n)
    else groups.set(key, [n])
  }

  // Per-layer, deterministic ordering of its groups.
  const layerGroups = new Map<string, string[]>()
  for (const key of groups.keys()) {
    const layer = key.split(DOUBLE_SEP)[0]
    const arr = layerGroups.get(layer)
    if (arr) arr.push(key)
    else layerGroups.set(layer, [key])
  }
  for (const arr of layerGroups.values()) arr.sort()

  for (const [layer, keys] of layerGroups) {
    const z = LAYER_Z_OFFSET[layer] ?? 0
    const baseAngle = LAYER_ANGLE[layer] ?? 0
    // The ring must hold the groups' circumferences: a fixed 150 px ring put
    // twenty communities on top of each other, which read as one ball.
    const radii = keys.map((k) => 14 + 4 * Math.sqrt(groups.get(k)!.length))
    // Spread the cores so their clouds do not touch. Two constraints, the
    // tighter one wins: the ring must hold the sizes (arc), and it must hold
    // them at the WORST angular gap — the jitter narrows a neighbour pair to
    // `1 - 2·JITTER` of the step, and the radial jitter pulls a core in to
    // `1 - RADIAL`. Sizing on the average gap (or on the nominal one) let two
    // communities land 11 px apart.
    const step = (Math.PI * 2) / Math.max(1, keys.length)
    const ring = keys.length > 1
      ? Math.max(
          150,
          (radii.reduce((a, b) => a + b, 0) * 1.4) / Math.PI,
          (2 * Math.max(...radii)) / ((1 - RADIAL_JITTER) * 2 * Math.sin((step * (1 - 2 * ANGLE_JITTER)) / 2)),
        )
      : 0
    keys.forEach((key, gi) => {
      const ids = groups.get(key)!
      // Every group gets its own deterministic shape: an even spiral on a
      // sphere is what read as "a ball". A nebula needs an irregular outline,
      // a dense core and a sparse halo.
      const rng = mulberry32(hashString(key))
      const phase = rng() * Math.PI * 2
      const radial = ring === 0 ? 0 : ring * (1 - RADIAL_JITTER + 2 * RADIAL_JITTER * rng())
      const angle =
        baseAngle + gi * step + (rng() - 0.5) * 2 * ANGLE_JITTER * step
      const cx = Math.cos(angle) * radial
      const cy = Math.sin(angle) * radial
      const squashY = 0.5 + 0.35 * rng() // flattened in Y: a disc, not a sphere
      const tilt = (rng() - 0.5) * 1.1
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)

      // Busiest first: rank 0 is the core, the leaves are the halo.
      ids.sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

      const n = ids.length
      const r = radii[gi]
      for (let k = 0; k < n; k++) {
        // Rank drives the radius: a hub sits at the centre, a leaf at the rim.
        // The 1.7 exponent packs half the nodes inside ~31 % of the radius —
        // that density contrast IS the relief the eye reads.
        const t = (k + 0.5) / n
        const radius = r * Math.pow(t, 1.7) * (0.9 + 0.2 * rng())
        const rr = Math.acos(1 - 2 * (k + 0.5) / n) // directions stay even
        const th = k * GOLDEN_ANGLE + phase
        const s = Math.sin(rr)
        const x0 = radius * s * Math.cos(th)
        const y0 = radius * s * Math.sin(th) * squashY
        const z0 = radius * Math.cos(rr) * 0.85
        out.set(ids[k].id, {
          x: cx + x0,
          y: cy + y0 * cosT - z0 * sinT,
          z: z + y0 * sinT + z0 * cosT,
        })
      }
    })
  }
  return out
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** How far a core may drift along its radius, as a fraction of the ring. */
const RADIAL_JITTER = 0.1
/** How far a core may drift in angle, as a fraction of the angular step. */
const ANGLE_JITTER = 0.15

const RELAYOUT_THRESHOLD = 0.2 // 20% change triggers relayout

export function useGraph3DLayout() {
  // Cache positions for stable refresh
  const positionCache = useRef<Map<string, { x: number; y: number; z: number }>>(new Map())
  const previousNodeIds = useRef<Set<string>>(new Set())

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

    // Build 3D nodes (positions filled below from cache or the deterministic layout).
    const communityByPath = communityIndex(nodes)
    const graph3dNodes: Graph3DNode[] = nodes.map((node) =>
      toGraph3DNode(node, communityByPath, positionCache.current.get(node.id)),
    )

    // Weight, shared by both views: the size of a node and its place in the
    // core (a hub at the centre, a leaf at the rim) both key on this.
    const degree = new Map<string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    for (const n of graph3dNodes) n.degree = degree.get(n.id) ?? 0

    // Nodes without a cached position are laid out deterministically in one
    // O(N log N) pass (po-graph's Fermat-spiral-per-community). On a first load
    // that is every node → the layout is complete immediately, no force
    // settling. Cached positions win so refreshes and drags stay stable.
    const uncached = graph3dNodes.filter((n) => !positionCache.current.has(n.id))
    if (uncached.length > 0) {
      const placed = deterministicPlacement(uncached, edges)
      for (const n of uncached) {
        const p = placed.get(n.id)
        if (p) {
          n.x = p.x
          n.y = p.y
          n.z = p.z
          positionCache.current.set(n.id, p)
        }
      }
    }

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
  }, [])

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
