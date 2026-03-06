import { atom } from 'jotai'
import type {
  IntelligenceLayer,
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceSummary,
  VisibilityMode,
} from '@/types/intelligence'
import { LAYERS, LAYER_ORDER } from '@/constants/intelligence'

// ============================================================================
// INTELLIGENCE VISUALIZATION — Jotai Atoms
// ============================================================================

// ── Layer visibility ─────────────────────────────────────────────────────────

/** Which layers are currently enabled */
export const visibleLayersAtom = atom<Set<IntelligenceLayer>>(
  new Set(
    LAYER_ORDER.filter((l) => LAYERS[l].enabled),
  ),
)

/** Current visibility preset mode */
export const visibilityModeAtom = atom<VisibilityMode>('code_only')

// ── Graph data ───────────────────────────────────────────────────────────────

/** All nodes in the current graph */
export const intelligenceNodesAtom = atom<IntelligenceNode[]>([])

/** All edges in the current graph */
export const intelligenceEdgesAtom = atom<IntelligenceEdge[]>([])

/** Loading state for graph data */
export const intelligenceLoadingAtom = atom<boolean>(false)

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

// ── Visual overlays ─────────────────────────────────────────────────────

/** Energy heatmap overlay — recolors note nodes by energy (red→green) */
export const energyHeatmapAtom = atom<boolean>(false)

/** TOUCHES heatmap — highlights file nodes by churn_score (green glow) */
export const touchesHeatmapAtom = atom<boolean>(false)

/** CO_CHANGED threshold — hide CO_CHANGED edges with count below this value */
export const coChangeThresholdAtom = atom<number>(1)

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
export const graphViewModeAtom = atom<GraphViewMode>('2d')
