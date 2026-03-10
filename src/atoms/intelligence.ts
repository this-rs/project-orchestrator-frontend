import { atom } from 'jotai'
import type {
  IntelligenceLayer,
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceRelationType,
  IntelligenceSummary,
  VisibilityMode,
  BackendGraphCommunity,
} from '@/types/intelligence'
import { LAYERS, LAYER_ORDER, ANIMATION, EDGE_RENDER_PRIORITY } from '@/constants/intelligence'

// ============================================================================
// INTELLIGENCE VISUALIZATION — Jotai Atoms
// ============================================================================

// ── Loading stages (step-by-step progress) ──────────────────────────────────

export type LoadingStageStatus = 'pending' | 'loading' | 'done' | 'error'

export interface LoadingStage {
  id: string
  label: string
  status: LoadingStageStatus
  detail?: string          // e.g. "245 nodes" after done
  startedAt?: number       // Date.now()
  completedAt?: number
  /** Sub-progress: current value (e.g. clusters done, nodes fetched) */
  progress?: number
  /** Sub-progress: total value */
  progressTotal?: number
}

/** Ordered loading stages — updated by the graph hooks for step-by-step UX */
export const graphLoadingStagesAtom = atom<LoadingStage[]>([])

/** Whether the loading progress overlay should be visible */
export const graphLoadingActiveAtom = atom<boolean>((get) => {
  const stages = get(graphLoadingStagesAtom)
  if (stages.length === 0) return false
  // Active if any stage is loading or pending (not all done/error)
  return stages.some((s) => s.status === 'loading' || s.status === 'pending')
})

// ── Layer visibility ─────────────────────────────────────────────────────────

/** Which layers are currently enabled */
export const visibleLayersAtom = atom<Set<IntelligenceLayer>>(
  new Set(
    LAYER_ORDER.filter((l) => LAYERS[l].enabled),
  ),
)

/** Current visibility preset mode */
export const visibilityModeAtom = atom<VisibilityMode>('code_only')

/** Hovered entity type from the legend — highlights matching nodes on the canvas */
export const legendHoveredTypeAtom = atom<string | null>(null)

/** Hovered project slug from the project filter bar — illuminates matching nodes */
export const hoveredProjectSlugAtom = atom<string | null>(null)

// ── Graph data ───────────────────────────────────────────────────────────────

/** All nodes in the current graph */
export const intelligenceNodesAtom = atom<IntelligenceNode[]>([])

/** All edges in the current graph */
export const intelligenceEdgesAtom = atom<IntelligenceEdge[]>([])

/** Loading state for graph data */
export const intelligenceLoadingAtom = atom<boolean>(false)

/** Per-layer loading state — tracks which layers have pending API requests */
export const loadingLayersAtom = atom<Set<string>>(new Set<string>())

/** Error state */
export const intelligenceErrorAtom = atom<string | null>(null)

// ── Selection ────────────────────────────────────────────────────────────────

/** Currently selected node ID */
export const selectedNodeIdAtom = atom<string | null>(null)

/** Derived: selected node object */
export const selectedNodeAtom = atom<IntelligenceNode | null>((get) => {
  const id = get(selectedNodeIdAtom)
  if (!id) return null
  const nodes = get(intelligenceNodesAtom)
  return nodes.find((n) => n.id === id) ?? null
})

/** Hovered node ID (for highlights) */
export const hoveredNodeIdAtom = atom<string | null>(null)

/** Highlighted group of node IDs — dims everything outside the group.
 *  Used by FG chip hover, milestone hover, etc. */
export const highlightedGroupAtom = atom<Set<string> | null>(null)

/** Entity types to dim (connections-only mode) — reduces opacity + scale for matching nodes.
 *  Set by UnifiedGraphSection when groups are in 'connections' mode. */
export const dimmedEntityTypesAtom = atom<Set<string> | null>(null)

// ── Summary ──────────────────────────────────────────────────────────────────

/** Intelligence summary from backend */
export const intelligenceSummaryAtom = atom<IntelligenceSummary | null>(null)

export const intelligenceSummaryLoadingAtom = atom<boolean>(false)

// ── Derived: filtered by visibility ──────────────────────────────────────────

/** Nodes filtered by currently visible layers */
export const visibleNodesAtom = atom<IntelligenceNode[]>((get) => {
  const nodes = get(intelligenceNodesAtom)
  const layers = get(visibleLayersAtom)
  return nodes.filter((n) => {
    const layer = (n.data as { layer?: IntelligenceLayer }).layer
    return layer ? layers.has(layer) : true
  })
})

/** Edges filtered by currently visible layers + CO_CHANGED threshold */
export const visibleEdgesAtom = atom<IntelligenceEdge[]>((get) => {
  const edges = get(intelligenceEdgesAtom)
  const layers = get(visibleLayersAtom)
  const visibleNodeIds = new Set(get(visibleNodesAtom).map((n) => n.id))
  const coChangeThreshold = get(coChangeThresholdAtom)

  return edges.filter((e) => {
    const edgeData = e.data as { layer?: IntelligenceLayer; relationType?: string; count?: number } | undefined
    const layer = edgeData?.layer
    const layerVisible = layer ? layers.has(layer) : true
    // Both source and target must be visible
    if (!layerVisible || !visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) {
      return false
    }
    // Apply CO_CHANGED threshold filter
    if (edgeData?.relationType === 'CO_CHANGED') {
      const count = edgeData.count ?? 1
      return count >= coChangeThreshold
    }
    return true
  })
})

// ── Edge budget ─────────────────────────────────────────────────────────

/** Priority index for edge sorting — lower index = higher priority (kept first) */
const edgePriorityIndex = new Map(
  EDGE_RENDER_PRIORITY.map((type, i) => [type, i]),
)

function getEdgePriority(edge: IntelligenceEdge): number {
  const relationType = (edge.data as { relationType?: string })?.relationType as IntelligenceRelationType | undefined
  return relationType ? (edgePriorityIndex.get(relationType) ?? 999) : 999
}

/** When true, bypass the edge budget and show ALL edges */
export const showAllEdgesAtom = atom<boolean>(false)

/** Edges after budget culling — sorted by EDGE_RENDER_PRIORITY, capped at MAX_VISIBLE_EDGES */
export const budgetedEdgesAtom = atom<IntelligenceEdge[]>((get) => {
  const edges = get(visibleEdgesAtom)
  if (get(showAllEdgesAtom)) return edges
  const max = ANIMATION.MAX_VISIBLE_EDGES
  if (edges.length <= max) return edges
  // Sort by priority (stable: Array.sort is stable in V8)
  const sorted = [...edges].sort((a, b) => getEdgePriority(a) - getEdgePriority(b))
  return sorted.slice(0, max)
})

/** Number of edges hidden by the budget (0 if under budget) */
export const hiddenEdgeCountAtom = atom<number>((get) => {
  const total = get(visibleEdgesAtom).length
  const budgeted = get(budgetedEdgesAtom).length
  return Math.max(0, total - budgeted)
})

// ── Visual overlays ─────────────────────────────────────────────────────

/** Energy heatmap overlay — recolors note nodes by energy (red→green) */
export const energyHeatmapAtom = atom<boolean>(false)

/** TOUCHES heatmap — highlights file nodes by churn_score (green glow) */
export const touchesHeatmapAtom = atom<boolean>(false)

/** CO_CHANGED threshold — hide CO_CHANGED edges with count below this value */
export const coChangeThresholdAtom = atom<number>(1)

/** Community hulls toggle — show/hide convex hull overlays in 3D view */
export const showCommunityHullsAtom = atom<boolean>(false)

/** Graph brightness (0→1) — controls ambient light intensity + background luminance */
export const graphBrightnessAtom = atom<number>(0.5)

/** Communities from the backend graph response */
export const intelligenceCommunitiesAtom = atom<BackendGraphCommunity[]>([])

// ── Graph node limit ────────────────────────────────────────────────────────

/** Max nodes requested from the API (configurable, default 1000) */
export const graphNodeLimitAtom = atom<number>(1000)

// ── Search / filter ──────────────────────────────────────────────────────────

/** Search query for filtering nodes */
export const intelligenceSearchAtom = atom<string>('')

/** Nodes matching search (subset of visible) */
export const searchFilteredNodesAtom = atom<IntelligenceNode[]>((get) => {
  const nodes = get(visibleNodesAtom)
  const query = get(intelligenceSearchAtom).toLowerCase().trim()
  if (!query) return nodes
  return nodes.filter((n) => {
    const label = (n.data as { label?: string }).label ?? ''
    return label.toLowerCase().includes(query)
  })
})

// ── Graph view mode ─────────────────────────────────────────────────────

/** Toggle between 2D (ReactFlow) and 3D (ForceGraph3D) views */
export type GraphViewMode = '2d' | '3d'
export const graphViewModeAtom = atom<GraphViewMode>('3d')
