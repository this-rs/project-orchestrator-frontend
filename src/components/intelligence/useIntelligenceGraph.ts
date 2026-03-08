import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import dagre from 'dagre'
import type {
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceLayer,
  BackendGraphNode,
  BackendGraphEdge,
  IntelligenceRelationType,
} from '@/types/intelligence'
import { NODE_SIZES, EDGE_STYLES } from '@/constants/intelligence'
import {
  intelligenceNodesAtom,
  intelligenceEdgesAtom,
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  intelligenceSummaryAtom,
  intelligenceSummaryLoadingAtom,
  visibleNodesAtom,
  budgetedEdgesAtom,
  hiddenEdgeCountAtom,
  selectedNodeIdAtom,
  visibleLayersAtom,
  visibilityModeAtom,
  graphNodeLimitAtom,
} from '@/atoms/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import { VISIBILITY_PRESETS } from '@/constants/intelligence'
import type { VisibilityMode } from '@/types/intelligence'

// ── Dagre layout ─────────────────────────────────────────────────────────────

function layoutGraph(
  nodes: IntelligenceNode[],
  edges: IntelligenceEdge[],
): { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 30, marginy: 30 })

  nodes.forEach((node) => {
    const entityType = (node.data as { entityType?: string }).entityType ?? 'file'
    const size = NODE_SIZES[entityType as keyof typeof NODE_SIZES] ?? { width: 32, height: 32 }
    g.setNode(node.id, { width: size.width + 20, height: size.height + 20 })
  })

  edges.forEach((edge) => {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  })

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    const entityType = (node.data as { entityType?: string }).entityType ?? 'file'
    const size = NODE_SIZES[entityType as keyof typeof NODE_SIZES] ?? { width: 32, height: 32 }
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ── Transform backend data → ReactFlow ───────────────────────────────────────

/** Map backend layer string to our IntelligenceLayer type */
function mapLayer(layer: string): IntelligenceLayer {
  const valid: IntelligenceLayer[] = ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral']
  return valid.includes(layer as IntelligenceLayer)
    ? (layer as IntelligenceLayer)
    : 'code'
}

/**
 * Transform a backend GraphNode into a ReactFlow IntelligenceNode.
 * Backend shape: { id, type, label, layer, attributes? }
 */
function toReactFlowNode(node: BackendGraphNode): IntelligenceNode {
  const entityType = node.type // "file", "function", "note", etc.
  const layer = mapLayer(node.layer)
  const attrs = node.attributes ?? {}

  return {
    id: node.id,
    type: entityType, // matches intelligenceNodeTypes keys
    position: { x: 0, y: 0 }, // will be set by dagre
    data: {
      label: node.label,
      entityType,
      layer,
      entityId: node.id,
      ...attrs,
    } as IntelligenceNode['data'],
  }
}

/**
 * Transform a backend GraphEdge into a ReactFlow IntelligenceEdge.
 * Backend shape: { source, target, type, layer, attributes? }
 */
/** Map relation types to custom edge component keys */
function mapEdgeType(relationType: IntelligenceRelationType): string {
  switch (relationType) {
    case 'SYNAPSE': return 'synapse'
    case 'CO_CHANGED': return 'co_changed'
    case 'AFFECTS': return 'affects'
    default: return 'default'
  }
}

function toReactFlowEdge(edge: BackendGraphEdge, index: number): IntelligenceEdge {
  const relationType = edge.type as IntelligenceRelationType
  const style = EDGE_STYLES[relationType] ?? { color: '#6B7280', strokeWidth: 1 }
  const edgeType = mapEdgeType(relationType)
  const attrs = edge.attributes ?? {}

  return {
    id: `e-${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    type: edgeType,
    animated: style.animated ?? false,
    // Only apply default styles for non-custom edges (custom edges handle their own)
    ...(edgeType === 'default' ? {
      style: {
        stroke: style.color,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      },
    } : {}),
    data: {
      relationType,
      layer: mapLayer(edge.layer),
      weight: (attrs.weight as number) ?? undefined,
      confidence: (attrs.confidence as number) ?? undefined,
      count: (attrs.co_change_count as number) ?? (attrs.count as number) ?? undefined,
    },
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useIntelligenceGraph(projectSlug: string | undefined) {
  const [nodes, setNodes] = useAtom(intelligenceNodesAtom)
  const [edges, setEdges] = useAtom(intelligenceEdgesAtom)
  const setLoading = useSetAtom(intelligenceLoadingAtom)
  const setError = useSetAtom(intelligenceErrorAtom)
  const setSummary = useSetAtom(intelligenceSummaryAtom)
  const setSummaryLoading = useSetAtom(intelligenceSummaryLoadingAtom)
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [visibleLayers, setVisibleLayers] = useAtom(visibleLayersAtom)
  const setVisibilityMode = useSetAtom(visibilityModeAtom)
  const nodeLimit = useAtomValue(graphNodeLimitAtom)

  const visibleNodes = useAtomValue(visibleNodesAtom)
  const visibleEdges = useAtomValue(budgetedEdgesAtom)
  const hiddenEdgeCount = useAtomValue(hiddenEdgeCountAtom)

  // Track which layers have already been fetched to avoid redundant calls
  const fetchedLayersRef = useRef<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch graph data — only request the specified layers
  const fetchGraphForLayers = useCallback(async (layers: string[], limit: number) => {
    if (!projectSlug || layers.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const data = await intelligenceApi.getGraph(projectSlug, { layers, limit })

      const rfNodes = data.nodes.map(toReactFlowNode)
      const rfEdges = data.edges.map(toReactFlowEdge)

      // Merge with existing data (for incremental layer loading)
      // or replace entirely (for initial load / slug change)
      setNodes((prev) => {
        if (prev.length === 0) return rfNodes
        // Remove old nodes from the fetched layers, then add new ones
        const fetchedLayerSet = new Set(layers)
        const kept = prev.filter((n) => {
          const layer = (n.data as { layer?: string }).layer
          return layer ? !fetchedLayerSet.has(layer) : true
        })
        return [...kept, ...rfNodes]
      })
      setEdges((prev) => {
        if (prev.length === 0) return rfEdges
        const fetchedLayerSet = new Set(layers)
        const kept = prev.filter((e) => {
          const layer = (e.data as { layer?: string })?.layer
          return layer ? !fetchedLayerSet.has(layer) : true
        })
        return [...kept, ...rfEdges]
      })

      // Mark these layers as fetched
      layers.forEach((l) => fetchedLayersRef.current.add(l))
    } catch (err) {
      console.error('[useIntelligenceGraph] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, setNodes, setEdges, setLoading, setError])

  // Public fetchGraph — fetches all currently visible layers
  const fetchGraph = useCallback(async () => {
    const layers = Array.from(visibleLayers) as string[]
    fetchedLayersRef.current.clear()
    await fetchGraphForLayers(layers, nodeLimit)
  }, [visibleLayers, nodeLimit, fetchGraphForLayers])

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!projectSlug) return
    setSummaryLoading(true)
    try {
      const summary = await intelligenceApi.getSummary(projectSlug)
      setSummary(summary)
    } catch {
      // Summary is optional — don't block the graph
    } finally {
      setSummaryLoading(false)
    }
  }, [projectSlug, setSummary, setSummaryLoading])

  // Load on mount / slug change — reset everything and fetch visible layers
  useEffect(() => {
    fetchedLayersRef.current.clear()
    setNodes([])
    setEdges([])
    const layers = Array.from(visibleLayers) as string[]
    fetchGraphForLayers(layers, nodeLimit)
    fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on slug change
  }, [projectSlug])

  // Re-fetch when visible layers change — debounced 300ms to handle rapid preset switching
  // Only fetches layers that haven't been loaded yet (incremental)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const needed = Array.from(visibleLayers).filter(
        (l) => !fetchedLayersRef.current.has(l),
      ) as string[]
      if (needed.length > 0) {
        fetchGraphForLayers(needed, nodeLimit)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced layer fetch
  }, [visibleLayers, nodeLimit])

  // Apply visibility preset
  const applyPreset = useCallback((presetId: VisibilityMode) => {
    const preset = VISIBILITY_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      setVisibleLayers(new Set(preset.layers))
      setVisibilityMode(presetId)
    }
  }, [setVisibleLayers, setVisibilityMode])

  // Toggle a single layer
  const toggleLayer = useCallback((layer: IntelligenceLayer) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) {
        next.delete(layer)
      } else {
        next.add(layer)
      }
      return next
    })
    setVisibilityMode('custom')
  }, [setVisibleLayers, setVisibilityMode])

  // Layout the currently visible nodes — memoized to avoid expensive dagre
  // recalculation on every render (hover, selection, etc.). Only re-layouts
  // when the filtered node/edge lists actually change (fetch or layer toggle).
  const layouted = useMemo(
    () => layoutGraph(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges],
  )

  return {
    nodes: layouted.nodes,
    edges: layouted.edges,
    allNodes: nodes,
    allEdges: edges,
    hiddenEdgeCount,
    selectedNodeId,
    setSelectedNodeId,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
    fetchSummary,
  }
}
