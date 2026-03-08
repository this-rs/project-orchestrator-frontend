import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type {
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceLayer,
  BackendGraphNode,
  BackendGraphEdge,
  IntelligenceRelationType,
  ProjectGraphMeta,
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
  loadingLayersAtom,
} from '@/atoms/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import { VISIBILITY_PRESETS } from '@/constants/intelligence'
import type { VisibilityMode } from '@/types/intelligence'

// ── Dagre Web Worker ─────────────────────────────────────────────────────────

let sharedWorker: Worker | null = null
function getDagreWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('@/workers/dagreWorker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return sharedWorker
}

function serializeForWorker(nodes: IntelligenceNode[]) {
  return nodes.map((node) => {
    const entityType = (node.data as { entityType?: string }).entityType ?? 'file'
    const size = NODE_SIZES[entityType as keyof typeof NODE_SIZES] ?? { width: 32, height: 32 }
    return { id: node.id, width: size.width + 20, height: size.height + 20 }
  })
}

// ── Transform backend data → ReactFlow ───────────────────────────────────────

function mapLayer(layer: string): IntelligenceLayer {
  const valid: IntelligenceLayer[] = ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral']
  return valid.includes(layer as IntelligenceLayer)
    ? (layer as IntelligenceLayer)
    : 'code'
}

function toReactFlowNode(node: BackendGraphNode): IntelligenceNode {
  const entityType = node.type
  const layer = mapLayer(node.layer)
  const attrs = node.attributes ?? {}

  return {
    id: node.id,
    type: entityType,
    position: { x: 0, y: 0 },
    data: {
      label: node.label,
      entityType,
      layer,
      entityId: node.id,
      // Workspace-specific: project info injected by backend
      projectSlug: (attrs.project_slug as string) ?? undefined,
      projectName: (attrs.project_name as string) ?? undefined,
      ...attrs,
    } as IntelligenceNode['data'],
  }
}

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
    id: `e|${edge.source}|${edge.target}|${index}`,
    source: edge.source,
    target: edge.target,
    type: edgeType,
    animated: style.animated ?? false,
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

export function useWorkspaceIntelligenceGraph(workspaceSlug: string | undefined) {
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
  const setLoadingLayers = useSetAtom(loadingLayersAtom)

  const visibleNodes = useAtomValue(visibleNodesAtom)
  const visibleEdges = useAtomValue(budgetedEdgesAtom)
  const hiddenEdgeCount = useAtomValue(hiddenEdgeCountAtom)

  // Workspace-specific: project metadata + per-project filter
  const [projectMetas, setProjectMetas] = useState<ProjectGraphMeta[]>([])
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)

  const fetchedLayersRef = useRef<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch workspace graph data — only request the specified layers
  const fetchGraphForLayers = useCallback(async (layers: string[], limit: number) => {
    if (!workspaceSlug || layers.length === 0) return
    setLoading(true)
    setError(null)
    setLoadingLayers((prev: Set<string>) => {
      const next = new Set(prev)
      layers.forEach((l) => next.add(l))
      return next
    })
    try {
      const data = await intelligenceApi.getWorkspaceGraph(workspaceSlug, { layers, limit })

      // Store project metadata
      setProjectMetas(data.projects)

      const rfNodes = data.nodes.map(toReactFlowNode)
      const rfEdges = [...data.edges, ...data.cross_project_edges].map(toReactFlowEdge)

      // Merge with existing data (incremental layer loading)
      setNodes((prev) => {
        if (prev.length === 0) return rfNodes
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

      layers.forEach((l) => fetchedLayersRef.current.add(l))
    } catch (err) {
      console.error('[useWorkspaceIntelligenceGraph] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load workspace graph')
    } finally {
      setLoading(false)
      setLoadingLayers((prev: Set<string>) => {
        const next = new Set(prev)
        layers.forEach((l) => next.delete(l))
        return next
      })
    }
  }, [workspaceSlug, setNodes, setEdges, setLoading, setError, setLoadingLayers])

  const fetchGraph = useCallback(async () => {
    const layers = Array.from(visibleLayers) as string[]
    fetchedLayersRef.current.clear()
    await fetchGraphForLayers(layers, nodeLimit)
  }, [visibleLayers, nodeLimit, fetchGraphForLayers])

  // Fetch workspace summary (aggregated)
  const fetchSummary = useCallback(async () => {
    if (!workspaceSlug) return
    setSummaryLoading(true)
    try {
      const wsData = await intelligenceApi.getWorkspaceSummary(workspaceSlug)
      // Set the aggregated summary into the shared atom (compatible with dashboard sections)
      setSummary(wsData.aggregated)
    } catch {
      // Summary is optional
    } finally {
      setSummaryLoading(false)
    }
  }, [workspaceSlug, setSummary, setSummaryLoading])

  // Load on mount / slug change — progressive loading
  useEffect(() => {
    fetchedLayersRef.current.clear()
    setNodes([])
    setEdges([])
    setProjectMetas([])
    setActiveProjectFilter(null)
    const layers = Array.from(visibleLayers) as string[]

    const primary = layers.filter((l) => l === 'code' || l === 'fabric')
    const rest = layers.filter((l) => l !== 'code' && l !== 'fabric')

    if (primary.length > 0 && rest.length > 0) {
      fetchGraphForLayers(primary, nodeLimit).then(() => {
        fetchGraphForLayers(rest, nodeLimit)
      })
    } else {
      fetchGraphForLayers(layers, nodeLimit)
    }
    fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on slug change
  }, [workspaceSlug])

  // Re-fetch when visible layers change (debounced, incremental)
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

  // ── Async dagre layout via Web Worker ─────────────────────────────────────
  const [layoutedNodes, setLayoutedNodes] = useState<IntelligenceNode[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<IntelligenceEdge[]>([])
  const [layouting, setLayouting] = useState(false)
  const layoutVersionRef = useRef(0)

  // Filter nodes by project if a filter is active
  // IMPORTANT: useMemo prevents new array refs every render which would cause
  // the layout useEffect to re-fire infinitely → Context Lost loop
  const filteredNodes = useMemo(
    () => activeProjectFilter
      ? visibleNodes.filter((n) => {
          const slug = (n.data as { projectSlug?: string }).projectSlug
          return slug === activeProjectFilter
        })
      : visibleNodes,
    [activeProjectFilter, visibleNodes],
  )

  const filteredEdges = useMemo(() => {
    if (!activeProjectFilter) return visibleEdges
    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    return visibleEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  }, [activeProjectFilter, filteredNodes, visibleEdges])

  useEffect(() => {
    if (filteredNodes.length === 0) {
      setLayoutedNodes([])
      setLayoutedEdges([])
      setLayouting(false)
      return
    }

    const version = ++layoutVersionRef.current
    setLayouting(true)

    const worker = getDagreWorker()
    const serializedNodes = serializeForWorker(filteredNodes)
    const serializedEdges = filteredEdges.map((e) => ({ source: e.source, target: e.target }))

    const handler = (event: MessageEvent<{ nodes: { id: string; x: number; y: number }[] }>) => {
      if (version !== layoutVersionRef.current) return

      const positionMap = new Map(event.data.nodes.map((n) => [n.id, { x: n.x, y: n.y }]))

      setLayoutedNodes(
        filteredNodes.map((node) => {
          const pos = positionMap.get(node.id)
          return pos ? { ...node, position: pos } : node
        }),
      )
      setLayoutedEdges(filteredEdges)
      setLayouting(false)
      worker.removeEventListener('message', handler)
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ nodes: serializedNodes, edges: serializedEdges })

    return () => {
      worker.removeEventListener('message', handler)
    }
  }, [filteredNodes, filteredEdges])

  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
    layouting,
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
    // Workspace-specific
    projectMetas,
    activeProjectFilter,
    setActiveProjectFilter,
  }
}
