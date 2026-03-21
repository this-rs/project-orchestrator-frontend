import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
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

// ── Dagre Web Worker ─────────────────────────────────────────────────────────

/** Lazily create a single shared worker instance */
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

/** Terminate the shared worker to free resources (called on unmount) */
function terminateDagreWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate()
    sharedWorker = null
  }
}

/**
 * Serialize ReactFlow nodes into the minimal {id, width, height} the worker expects.
 * Also pre-computes the size lookup so the worker doesn't need NODE_SIZES.
 */
function serializeForWorker(nodes: IntelligenceNode[]) {
  return nodes.map((node) => {
    const entityType = (node.data as { entityType?: string }).entityType ?? 'file'
    const size = NODE_SIZES[entityType as keyof typeof NODE_SIZES] ?? { width: 32, height: 32 }
    return { id: node.id, width: size.width + 20, height: size.height + 20 }
  })
}

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

  // Fetch graph data — only request the specified layers
  const fetchGraphForLayers = useCallback(async (
    layers: string[],
    limit: number,
    stageId?: string,
    signal?: AbortSignal,
  ) => {
    if (!projectSlug || layers.length === 0) return
    setLoading(true)
    setError(null)
    // Track per-layer loading state for UI indicators
    setLoadingLayers((prev: Set<string>) => {
      const next = new Set(prev)
      layers.forEach((l) => next.add(l))
      return next
    })
    if (stageId) updateStage(stageId, { status: 'loading', startedAt: Date.now() })
    try {
      const data = await intelligenceApi.getGraph(projectSlug, { layers, limit }, signal)

      const rfNodes = data.nodes.map(toReactFlowNode)
      const rfEdges = data.edges.map(toReactFlowEdge)

      // Store communities from the backend response
      if (data.communities?.length > 0) {
        setCommunities(data.communities)
      }

      if (stageId) {
        updateStage(stageId, {
          status: 'done',
          completedAt: Date.now(),
          detail: `${rfNodes.length} nodes`,
        })
      }

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
      // AbortError is expected when navigating away — silently ignore
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (signal?.aborted) return
      console.error('[useIntelligenceGraph] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load graph')
      if (stageId) updateStage(stageId, { status: 'error', completedAt: Date.now() })
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
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
    await fetchGraphForLayers(layers, nodeLimit)
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
      updateStage('fetch_summary', { status: 'done', completedAt: Date.now(), detail: 'skipped' })
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
      stages.push({ id: 'fetch_primary', label: `Fetching code & fabric layers`, status: 'pending' })
    }
    if (rest.length > 0) {
      stages.push({ id: 'fetch_secondary', label: `Fetching ${rest.join(', ')} layers`, status: 'pending' })
    }
    if (primary.length === 0 && rest.length === 0) {
      stages.push({ id: 'fetch_data', label: 'Fetching graph data', status: 'pending' })
    }
    stages.push({ id: 'fetch_summary', label: 'Loading summary', status: 'pending' })
    stages.push({ id: 'layout', label: 'Computing layout', status: 'pending' })
    setStages(stages)

    if (primary.length > 0 && rest.length > 0) {
      fetchGraphForLayers(primary, nodeLimit, 'fetch_primary', signal).then(() => {
        if (!signal.aborted) {
          fetchGraphForLayers(rest, nodeLimit, 'fetch_secondary', signal)
        }
      })
    } else {
      fetchGraphForLayers(layers, nodeLimit, 'fetch_data', signal)
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
      terminateDagreWorker()
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
          { id: stageId, label: `Fetching ${needed.join(', ')} layers`, status: 'pending' },
          { id: 'layout', label: 'Computing layout', status: 'pending' },
        ]
        setStages(stages)
        fetchGraphForLayers(needed, nodeLimit, stageId)
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
  // Posts nodes/edges to the worker, receives progress + result messages.
  // The worker splits into connected components and reports per-component progress.
  const [layoutedNodes, setLayoutedNodes] = useState<IntelligenceNode[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<IntelligenceEdge[]>([])
  const [layouting, setLayouting] = useState(false)
  const layoutVersionRef = useRef(0)

  // Track node identity to detect edge-only changes (e.g. show-all-edges toggle)
  const prevNodeFingerprintRef = useRef('')
  const hasLayoutedOnceRef = useRef(false)

  useEffect(() => {
    if (visibleNodes.length === 0) {
      setLayoutedNodes([])
      setLayoutedEdges([])
      setLayouting(false)
      prevNodeFingerprintRef.current = ''
      hasLayoutedOnceRef.current = false
      return
    }

    // Build a lightweight fingerprint of node IDs to detect node-set changes
    const nodeFingerprint = visibleNodes.map((n) => n.id).sort().join(',')
    const nodesChanged = nodeFingerprint !== prevNodeFingerprintRef.current
    prevNodeFingerprintRef.current = nodeFingerprint

    // If only edges changed (e.g. show-all-edges toggle, CO_CHANGED threshold),
    // skip the full dagre re-layout — node positions don't change.
    // Show a brief loading stage so the user sees feedback.
    if (!nodesChanged && hasLayoutedOnceRef.current) {
      const edgeCount = visibleEdges.length
      const startedAt = Date.now()
      setStages([
        { id: 'update_edges', label: 'Updating edges', status: 'loading', startedAt, detail: `${edgeCount} edges` },
      ])
      // Use rAF to let the loading stage render before updating
      requestAnimationFrame(() => {
        setLayoutedEdges(visibleEdges)
        setStages([
          { id: 'update_edges', label: 'Updating edges', status: 'done', startedAt, completedAt: Date.now(), detail: `${edgeCount} edges` },
        ])
      })
      return
    }

    const version = ++layoutVersionRef.current
    setLayouting(true)
    updateStage('layout', { status: 'loading', startedAt: Date.now() })

    const worker = getDagreWorker()
    const serializedNodes = serializeForWorker(visibleNodes)
    const serializedEdges = visibleEdges.map((e) => ({ source: e.source, target: e.target }))

    const handler = (event: MessageEvent<{ type: string; [key: string]: unknown }>) => {
      if (version !== layoutVersionRef.current) return
      const msg = event.data

      if (msg.type === 'progress') {
        const { done, total, nodesDone, nodesTotal } = msg as {
          type: string; done: number; total: number; nodesDone: number; nodesTotal: number
        }
        updateStage('layout', {
          status: 'loading',
          detail: total > 1
            ? `${done}/${total} clusters · ${nodesDone}/${nodesTotal} nodes`
            : `${nodesDone}/${nodesTotal} nodes`,
          progress: nodesDone,
          progressTotal: nodesTotal,
        })
        return
      }

      if (msg.type === 'result') {
        const { nodes: resultNodes, components } = msg as {
          type: string; nodes: { id: string; x: number; y: number }[]; components: number
        }
        const positionMap = new Map(resultNodes.map((n) => [n.id, { x: n.x, y: n.y }]))

        setLayoutedNodes(
          visibleNodes.map((node) => {
            const pos = positionMap.get(node.id)
            return pos ? { ...node, position: pos } : node
          }),
        )
        setLayoutedEdges(visibleEdges)
        setLayouting(false)
        hasLayoutedOnceRef.current = true
        updateStage('layout', {
          status: 'done',
          completedAt: Date.now(),
          detail: components > 1
            ? `${visibleNodes.length} nodes · ${components} clusters`
            : `${visibleNodes.length} nodes`,
          progress: visibleNodes.length,
          progressTotal: visibleNodes.length,
        })
        worker.removeEventListener('message', handler)
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ nodes: serializedNodes, edges: serializedEdges })

    return () => {
      worker.removeEventListener('message', handler)
    }
  }, [visibleNodes, visibleEdges, updateStage])

  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
    layouting,
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
