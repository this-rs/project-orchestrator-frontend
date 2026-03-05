import { useCallback, useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import dagre from 'dagre'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceLayer } from '@/types/intelligence'
import { NODE_SIZES, EDGE_STYLES } from '@/constants/intelligence'
import {
  intelligenceNodesAtom,
  intelligenceEdgesAtom,
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  intelligenceSummaryAtom,
  intelligenceSummaryLoadingAtom,
  visibleNodesAtom,
  visibleEdgesAtom,
  selectedNodeIdAtom,
  visibleLayersAtom,
  visibilityModeAtom,
} from '@/atoms/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import type { GraphNode, GraphEdge } from '@/services/intelligence'
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

function toReactFlowNode(node: GraphNode): IntelligenceNode {
  return {
    id: node.id,
    type: node.entityType, // matches intelligenceNodeTypes keys
    position: { x: 0, y: 0 }, // will be set by dagre
    data: {
      label: node.label,
      entityType: node.entityType,
      layer: node.layer as IntelligenceLayer,
      entityId: node.id,
      ...node.properties,
    } as IntelligenceNode['data'],
  }
}

function toReactFlowEdge(edge: GraphEdge): IntelligenceEdge {
  const style = EDGE_STYLES[edge.relationType] ?? { color: '#6B7280', strokeWidth: 1 }
  const isAnimated = edge.relationType === 'SYNAPSE'

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: isAnimated ? 'synapse' : 'default',
    animated: style.animated ?? false,
    style: {
      stroke: style.color,
      strokeWidth: style.strokeWidth,
      strokeDasharray: style.strokeDasharray,
    },
    data: {
      relationType: edge.relationType,
      layer: edge.layer as IntelligenceLayer,
      weight: edge.weight,
      confidence: edge.confidence,
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

  const visibleNodes = useAtomValue(visibleNodesAtom)
  const visibleEdges = useAtomValue(visibleEdgesAtom)

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    if (!projectSlug) return
    setLoading(true)
    setError(null)
    try {
      const data = await intelligenceApi.getGraph(projectSlug, {
        include_edges: true,
      })
      const rfNodes = data.nodes.map(toReactFlowNode)
      const rfEdges = data.edges.map(toReactFlowEdge)
      const layouted = layoutGraph(rfNodes, rfEdges)
      setNodes(layouted.nodes)
      setEdges(layouted.edges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, setNodes, setEdges, setLoading, setError])

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

  // Load on mount
  useEffect(() => {
    fetchGraph()
    fetchSummary()
  }, [fetchGraph, fetchSummary])

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

  // Layout the currently visible nodes
  const layouted = layoutGraph(visibleNodes, visibleEdges)

  return {
    nodes: layouted.nodes,
    edges: layouted.edges,
    allNodes: nodes,
    allEdges: edges,
    selectedNodeId,
    setSelectedNodeId,
    visibleLayers,
    toggleLayer,
    applyPreset,
    fetchGraph,
    fetchSummary,
  }
}
