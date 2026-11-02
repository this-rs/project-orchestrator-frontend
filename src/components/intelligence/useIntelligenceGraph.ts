import { useCallback, useEffect, useRef, useState } from 'react'
import { useT, type MessageKey } from '@/i18n'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type {
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceLayer,
  BackendGraphNode,
  BackendGraphEdge,
  IntelligenceRelationType,
  ProjectGraphResponse,
} from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'
import { streamLayers, replaceLayerById, mergeById } from './graphLayerStream'
import {
  intelligenceNodesAtom,
  intelligenceEdgesAtom,
  intelligenceLoadingAtom,
  intelligenceErrorAtom,
  intelligenceSummaryAtom,
  intelligenceSummaryLoadingAtom,
  intelligenceCommunitiesAtom,
  visibleNodesAtom,
  budgetedEdgesAtom,
  selectedNodeIdAtom,
  visibleLayersAtom,
  visibilityModeAtom,
  graphNodeLimitAtom,
  loadingLayersAtom,
  graphLoadingStagesAtom,
  type LoadingStage,
} from '@/atoms/intelligence'
import { intelligenceApi } from '@/services/intelligence'
import { VISIBILITY_PRESETS } from '@/constants/intelligence'
import type { VisibilityMode } from '@/types/intelligence'

// ── Transform backend data → ReactFlow ───────────────────────────────────────

/** Map backend layer string to our IntelligenceLayer type */
function mapLayer(layer: string): IntelligenceLayer {
  const valid: IntelligenceLayer[] = ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral', 'chat']
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
    case 'CO_CHANGED_TRANSITIVE': return 'co_changed'
    case 'AFFECTS': return 'affects'
    default: return 'default'
  }
}

function toReactFlowEdge(edge: BackendGraphEdge): IntelligenceEdge {
  const relationType = edge.type as IntelligenceRelationType
  const style = EDGE_STYLES[relationType] ?? { color: '#6B7280', strokeWidth: 1 }
  const edgeType = mapEdgeType(relationType)
  const attrs = edge.attributes ?? {}

  return {
    // Stable id (no array index): the same edge returned by two layer requests merges.
    id: `e|${edge.source}|${edge.target}|${edge.type}`,
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

type Tr = ReturnType<typeof useT>['t']
const countOf = (t: Tr, n: number, one: MessageKey, other: MessageKey) => t(n === 1 ? one : other, { count: n })
const nodesText = (t: Tr, n: number) => countOf(t, n, 'intelPage.graph.stage.nodesOne', 'intelPage.graph.stage.nodesOther')

export function useIntelligenceGraph(projectSlug: string | undefined) {
  const { t } = useT()
  const tRef = useRef(t)
  tRef.current = t
  const [nodes, setNodes] = useAtom(intelligenceNodesAtom)
  const [edges, setEdges] = useAtom(intelligenceEdgesAtom)
  const setLoading = useSetAtom(intelligenceLoadingAtom)
  const setError = useSetAtom(intelligenceErrorAtom)
  const setSummary = useSetAtom(intelligenceSummaryAtom)
  const setSummaryLoading = useSetAtom(intelligenceSummaryLoadingAtom)
  const setCommunities = useSetAtom(intelligenceCommunitiesAtom)
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom)
  const [visibleLayers, setVisibleLayers] = useAtom(visibleLayersAtom)
  const setVisibilityMode = useSetAtom(visibilityModeAtom)
  const nodeLimit = useAtomValue(graphNodeLimitAtom)
  const setLoadingLayers = useSetAtom(loadingLayersAtom)
  const setStages = useSetAtom(graphLoadingStagesAtom)

  const visibleNodes = useAtomValue(visibleNodesAtom)
  const visibleEdges = useAtomValue(budgetedEdgesAtom)

  // Track which layers have already been fetched to avoid redundant calls
  const fetchedLayersRef = useRef<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Stage helpers ─────────────────────────────────────────────────────────
  const updateStage = useCallback((id: string, patch: Partial<LoadingStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [setStages])

  // Requests in flight (primary + secondary groups run together): the global
  // loading flag only drops when the last one settles.
  const pendingRef = useRef(0)
  const nodeLayerOf = (n: IntelligenceNode) => (n.data as { layer?: string }).layer
  const edgeLayerOf = (e: IntelligenceEdge) => (e.data as { layer?: string } | undefined)?.layer

  // Fetch graph data — ONE request per layer, in parallel; each layer is
  // merged into the atoms (by id) the moment it arrives, so the graph fills in
  // layer after layer instead of waiting for the whole payload.
  // `budgetLayers` = every layer sharing the node budget (the sum of the
  // requested limits never exceeds `limit`, even when several groups run at once).
  const fetchGraphForLayers = useCallback(async (
    layers: string[],
    limit: number,
    stageId?: string,
    signal?: AbortSignal,
    force = false,
    budgetLayers?: string[],
  ) => {
    if (!projectSlug || layers.length === 0) return
    setError(null)
    setLoadingLayers((prev: Set<string>) => {
      const next = new Set(prev)
      layers.forEach((l) => next.add(l))
      return next
    })
    pendingRef.current += 1
    setLoading(true)
    if (stageId) updateStage(stageId, { status: 'loading', startedAt: Date.now() })
    let total = 0
    try {
      const res = await streamLayers<ProjectGraphResponse>({
        kind: 'project',
        slug: projectSlug,
        layers,
        budgetLayers,
        limit,
        signal,
        force,
        fetchLayer: (layer, lim, sig) =>
          intelligenceApi.getGraph(projectSlug, { layers: [layer], limit: lim }, sig),
        onLayer: (layer, data) => {
          const rfNodes = data.nodes.map(toReactFlowNode)
          const rfEdges = data.edges.map(toReactFlowEdge)
          total += rfNodes.length
          if (data.communities?.length > 0) {
            setCommunities((prev) => mergeById(prev, data.communities))
          }
          // Same tick → React batches these into a single paint for this layer.
          setNodes((prev) => replaceLayerById(prev, rfNodes, layer, nodeLayerOf))
          setEdges((prev) => replaceLayerById(prev, rfEdges, layer, edgeLayerOf))
          fetchedLayersRef.current.add(layer)
          setLoadingLayers((prev: Set<string>) => {
            if (!prev.has(layer)) return prev
            const next = new Set(prev)
            next.delete(layer)
            return next
          })
          if (stageId) updateStage(stageId, { detail: nodesText(tRef.current, total) })
        },
      })
      if (signal?.aborted) return
      const failed = Object.entries(res.errors)
      if (failed.length > 0) {
        console.error('[useIntelligenceGraph] fetch error:', Object.fromEntries(failed))
        const first = failed[0][1]
        setError(first instanceof Error ? first.message : tRef.current('intelPage.graph.loadFailed'))
        if (stageId) updateStage(stageId, { status: 'error', completedAt: Date.now() })
      } else if (stageId) {
        updateStage(stageId, { status: 'done', completedAt: Date.now(), detail: nodesText(tRef.current, total) })
      }
    } finally {
      pendingRef.current = Math.max(0, pendingRef.current - 1)
      if (!signal?.aborted) {
        if (pendingRef.current === 0) setLoading(false)
        setLoadingLayers((prev: Set<string>) => {
          const next = new Set(prev)
          layers.forEach((l) => next.delete(l))
          return next
        })
      }
    }
  }, [projectSlug, setNodes, setEdges, setLoading, setError, setCommunities, setLoadingLayers, updateStage])

  // Public fetchGraph — fetches all currently visible layers
  const fetchGraph = useCallback(async () => {
    const layers = Array.from(visibleLayers) as string[]
    fetchedLayersRef.current.clear()
    // Explicit refresh (retry button, WebSocket-driven) must bypass the cache.
    await fetchGraphForLayers(layers, nodeLimit, undefined, undefined, true, layers)
  }, [visibleLayers, nodeLimit, fetchGraphForLayers])

  // Fetch summary
  const fetchSummary = useCallback(async (signal?: AbortSignal) => {
    if (!projectSlug) return
    setSummaryLoading(true)
    updateStage('fetch_summary', { status: 'loading', startedAt: Date.now() })
    try {
      const summary = await intelligenceApi.getSummary(projectSlug, signal)
      if (signal?.aborted) return
      setSummary(summary)
      updateStage('fetch_summary', { status: 'done', completedAt: Date.now() })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (signal?.aborted) return
      // Summary is optional — don't block the graph
      updateStage('fetch_summary', { status: 'done', completedAt: Date.now(), detail: tRef.current('intelPage.graph.stage.skipped') })
    } finally {
      if (!signal?.aborted) {
        setSummaryLoading(false)
      }
    }
  }, [projectSlug, setSummary, setSummaryLoading, updateStage])

  // Load on mount / slug change — progressive: code layer first for fast first paint
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    fetchedLayersRef.current.clear()
    setNodes([])
    setEdges([])
    const layers = Array.from(visibleLayers) as string[]

    // Progressive loading: fetch primary layer first (code), then remaining layers.
    const primary = layers.filter((l) => l === 'code' || l === 'fabric')
    const rest = layers.filter((l) => l !== 'code' && l !== 'fabric')

    // Initialize loading stages for step-by-step progress
    const stages: LoadingStage[] = []
    if (primary.length > 0) {
      stages.push({ id: 'fetch_primary', label: tRef.current('intelPage.graph.stage.fetchCodeFabric'), status: 'pending' })
    }
    if (rest.length > 0) {
      stages.push({ id: 'fetch_secondary', label: tRef.current('intelPage.graph.stage.fetchLayers', { layers: rest.join(', ') }), status: 'pending' })
    }
    if (primary.length === 0 && rest.length === 0) {
      stages.push({ id: 'fetch_data', label: tRef.current('intelPage.graph.stage.fetchData'), status: 'pending' })
    }
    stages.push({ id: 'fetch_summary', label: tRef.current('intelPage.graph.stage.loadSummary'), status: 'pending' })
    stages.push({ id: 'layout', label: tRef.current('intelPage.graph.stage.computeLayout'), status: 'pending' })
    setStages(stages)

    if (primary.length > 0 && rest.length > 0) {
      // Both groups start together; they share ONE budget (budgetLayers).
      fetchGraphForLayers(primary, nodeLimit, 'fetch_primary', signal, false, layers)
      fetchGraphForLayers(rest, nodeLimit, 'fetch_secondary', signal, false, layers)
    } else {
      fetchGraphForLayers(layers, nodeLimit, 'fetch_data', signal, false, layers)
    }
    fetchSummary(signal)

    // Cleanup on unmount or slug change: abort in-flight requests + free memory
    return () => {
      controller.abort()
      setNodes([])
      setEdges([])
      setSummary(null)
      setCommunities([])
      setStages([])
    }
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
        // Create loading stages for the incremental fetch + layout
        const stageId = `fetch_${needed.join('_')}`
        const stages: LoadingStage[] = [
          { id: stageId, label: tRef.current('intelPage.graph.stage.fetchLayers', { layers: needed.join(', ') }), status: 'pending' },
          { id: 'layout', label: tRef.current('intelPage.graph.stage.computeLayout'), status: 'pending' },
        ]
        setStages(stages)
        fetchGraphForLayers(needed, nodeLimit, stageId, undefined, false, Array.from(visibleLayers) as string[])
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

  // ── Layout: pass-through (no 2D dagre pass) ────────────────────────────────
  // The dagre worker used to lay out every visible set on each load. Nothing on
  // this page reads those positions (the 3D view places nodes itself, the code
  // map lays out its own boxes), and dagre grows super-linearly: ~12 s at 500
  // nodes, over two minutes at 2 000, so the "layout" stage never finished on a
  // full graph. The visible set is passed straight through instead; the stage is
  // kept so the progress panel still reads as complete.
  const [layoutedNodes, setLayoutedNodes] = useState<IntelligenceNode[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<IntelligenceEdge[]>([])

  useEffect(() => {
    setLayoutedNodes(visibleNodes)
    setLayoutedEdges(visibleEdges)
    updateStage('layout', {
      status: 'done',
      // Honest duration: the pass-through costs nothing, but the stage used to
      // be "loading" since the fetch began, so the panel reported the whole
      // load as « disposition ».
      startedAt: Date.now(),
      completedAt: Date.now(),
      detail: nodesText(tRef.current, visibleNodes.length),
      progress: visibleNodes.length,
      progressTotal: visibleNodes.length,
    })
  }, [visibleNodes, visibleEdges, updateStage])

  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
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
