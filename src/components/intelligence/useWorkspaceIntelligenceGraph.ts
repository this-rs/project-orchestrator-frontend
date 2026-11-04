import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT, type MessageKey } from '@/i18n'
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
import { EDGE_STYLES } from '@/constants/intelligence'
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
import { intelligenceApi, type GraphSyncMeta } from '@/services/intelligence'
import { VISIBILITY_PRESETS } from '@/constants/intelligence'
import { graphCacheKey, graphCachePeek, graphCacheSet } from './graphCache'
import { FULL_RELOAD_AFTER_MS, mergeWorkspaceDelta, progressiveGroups } from './graphDelta'
import type { VisibilityMode, WorkspaceGraphResponse } from '@/types/intelligence'

// ── Transform backend data → ReactFlow ───────────────────────────────────────

function mapLayer(layer: string): IntelligenceLayer {
  const valid: IntelligenceLayer[] = ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral', 'chat']
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

/** A cached workspace graph: the response, its sync cursor, and when it was last loaded in FULL. */
export type CachedWorkspaceGraph = WorkspaceGraphResponse & GraphSyncMeta & { loaded_full_at?: number }

/**
 * Refresh a stale workspace snapshot by its delta (same rules as the project
 * graph, see refreshProjectGraph): only what changed since its cursor is
 * fetched and folded in; anything the delta cannot vouch for is loaded in full.
 */
export async function refreshWorkspaceGraph(
  slug: string,
  layers: string[],
  limit: number,
  stale: CachedWorkspaceGraph | null,
  signal?: AbortSignal,
  now: number = Date.now(),
): Promise<CachedWorkspaceGraph> {
  const withinBound = stale?.loaded_full_at != null && now - stale.loaded_full_at < FULL_RELOAD_AFTER_MS
  if (stale?.synced_at && stale.deletions_tracked !== false && withinBound) {
    try {
      const delta = await intelligenceApi.getWorkspaceGraph(
        slug,
        { layers, limit, since: stale.synced_at, includeDeleted: true },
        signal,
      )
      if (delta.deletions_tracked !== false) {
        return {
          ...stale,
          ...delta,
          ...mergeWorkspaceDelta(stale, delta),
          communities: delta.communities?.length ? delta.communities : stale.communities,
          loaded_full_at: stale.loaded_full_at,
        }
      }
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }
  const full = await intelligenceApi.getWorkspaceGraph(slug, { layers, limit, includeDeleted: true }, signal)
  return { ...full, loaded_full_at: now }
}

export function useWorkspaceIntelligenceGraph(workspaceSlug: string | undefined) {
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

  // Workspace-specific: project metadata + per-project filter
  const [projectMetas, setProjectMetas] = useState<ProjectGraphMeta[]>([])
  const [activeProjectFilters, setActiveProjectFilters] = useState<Set<string>>(new Set())

  const fetchedLayersRef = useRef<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Stage helpers ─────────────────────────────────────────────────────────
  const updateStage = useCallback((id: string, patch: Partial<LoadingStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [setStages])

  // Fetch workspace graph data — only request the specified layers
  const fetchGraphForLayers = useCallback(async (
    layers: string[],
    limit: number,
    stageId?: string,
    signal?: AbortSignal,
    force = false,
    // How many layers share `limit`: ALL the layers of a progressive load, not
    // only this call's. Each call used to split `limit` over its own layers,
    // so code+fabric then the four others asked for 2× the limit.
    budgetLayers = layers.length,
  ) => {
    if (!workspaceSlug || layers.length === 0) return
    // Reuse a recently-loaded workspace response for this exact (layers, limit).
    // The API applies `limit` PER CATEGORY: asking 5000 with six layers can
    // return ~30 000 nodes. The number the user sets is a TOTAL budget, so each
    // layer gets its share of it — the share of every layer of the load, so
    // that the calls of a progressive load add up to the budget, not beyond.
    const perCategory = Math.max(1, Math.floor(limit / Math.max(1, budgetLayers, layers.length)))
    const cacheKey = graphCacheKey('workspace', workspaceSlug, layers, perCategory)
    // A forced refresh ignores a FRESH entry but may still start from its
    // snapshot: only the delta then crosses the wire, and nothing blinks (the
    // graph is already on screen). A first load keeps its indicators.
    const peeked = graphCachePeek(cacheKey)
    const cached = !force && peeked?.fresh ? (peeked.response as WorkspaceGraphResponse) : null
    const stale = peeked && !cached ? (peeked.response as CachedWorkspaceGraph) : null
    const background = force && stale != null
    setError(null)
    if (!background) {
      setLoadingLayers((prev: Set<string>) => {
        const next = new Set(prev)
        layers.forEach((l) => next.add(l))
        return next
      })
    }
    if (!cached && !background) {
      setLoading(true)
      if (stageId) updateStage(stageId, { status: 'loading', startedAt: Date.now() })
    }
    try {
      const data = cached ?? (await refreshWorkspaceGraph(workspaceSlug, layers, perCategory, stale, signal))
      if (!cached) graphCacheSet(cacheKey, data)

      // Store project metadata
      setProjectMetas(data.projects)

      // Store communities from the backend response
      if (data.communities?.length > 0) {
        setCommunities(data.communities)
      }

      const rfNodes = data.nodes.map(toReactFlowNode)
      const rfEdges = [...data.edges, ...data.cross_project_edges].map(toReactFlowEdge)

      if (stageId) {
        updateStage(stageId, {
          status: 'done',
          completedAt: Date.now(),
          detail: nodesText(tRef.current, rfNodes.length),
        })
      }

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
      // AbortError is expected when navigating away — silently ignore
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (signal?.aborted) return
      console.error('[useWorkspaceIntelligenceGraph] fetch error:', err)
      setError(err instanceof Error ? err.message : tRef.current('intelPage.graph.workspaceLoadFailed'))
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
  }, [workspaceSlug, setNodes, setEdges, setLoading, setError, setCommunities, setLoadingLayers, updateStage])

  const fetchGraph = useCallback(async () => {
    const layers = Array.from(visibleLayers) as string[]
    fetchedLayersRef.current.clear()
    // Explicit refresh must bypass a FRESH cache entry. It loads the same groups
    // as the initial load, each with its own cache entry, so it can start from
    // the snapshot that load left and read only the delta.
    await Promise.all(
      progressiveGroups(layers).map((group) =>
        fetchGraphForLayers(group, nodeLimit, undefined, undefined, true, layers.length),
      ),
    )
  }, [visibleLayers, nodeLimit, fetchGraphForLayers])

  // Fetch workspace summary (aggregated)
  const fetchSummary = useCallback(async (signal?: AbortSignal) => {
    if (!workspaceSlug) return
    setSummaryLoading(true)
    updateStage('fetch_summary', { status: 'loading', startedAt: Date.now() })
    try {
      const wsData = await intelligenceApi.getWorkspaceSummary(workspaceSlug, signal)
      if (signal?.aborted) return
      setSummary(wsData.aggregated)
      updateStage('fetch_summary', { status: 'done', completedAt: Date.now() })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (signal?.aborted) return
      updateStage('fetch_summary', { status: 'done', completedAt: Date.now(), detail: tRef.current('intelPage.graph.stage.skipped') })
    } finally {
      if (!signal?.aborted) {
        setSummaryLoading(false)
      }
    }
  }, [workspaceSlug, setSummary, setSummaryLoading, updateStage])

  // Load on mount / slug change — progressive loading
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    fetchedLayersRef.current.clear()
    setNodes([])
    setEdges([])
    // A new workspace means the previously selected node no longer exists in the
    // data: clear it so the inspector never shows an empty "fiche" for a stale id.
    setSelectedNodeId(null)
    setProjectMetas([])
    setActiveProjectFilters(new Set())
    const layers = Array.from(visibleLayers) as string[]

    const primary = layers.filter((l) => l === 'code' || l === 'fabric')
    const rest = layers.filter((l) => l !== 'code' && l !== 'fabric')

    // Initialize loading stages
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
      fetchGraphForLayers(primary, nodeLimit, 'fetch_primary', signal, false, layers.length).then(() => {
        if (!signal.aborted) {
          fetchGraphForLayers(rest, nodeLimit, 'fetch_secondary', signal, false, layers.length)
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
    }
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
        // Create loading stages for the incremental fetch + layout
        const stageId = `fetch_${needed.join('_')}`
        const stages: LoadingStage[] = [
          { id: stageId, label: tRef.current('intelPage.graph.stage.fetchLayers', { layers: needed.join(', ') }), status: 'pending' },
          { id: 'layout', label: tRef.current('intelPage.graph.stage.computeLayout'), status: 'pending' },
        ]
        setStages(stages)
        fetchGraphForLayers(needed, nodeLimit, stageId, undefined, false, visibleLayers.size)
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
  // Same reason as the project view (useIntelligenceGraph): the dagre worker
  // laid out every visible set, the 3D view ignores those positions (it places
  // nodes itself), and dagre grows super-linearly — ~12 s at 500 nodes, over
  // two minutes at 2 000 — while the page waited on it. A worker error left the
  // "layout" stage loading forever and the 3D view empty.
  const [layoutedNodes, setLayoutedNodes] = useState<IntelligenceNode[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<IntelligenceEdge[]>([])

  // Filter nodes by project(s) if any filters are active
  // IMPORTANT: useMemo prevents new array refs every render which would cause
  // the layout useEffect to re-fire infinitely → Context Lost loop
  const filteredNodes = useMemo(
    () => activeProjectFilters.size > 0
      ? visibleNodes.filter((n) => {
          const slug = (n.data as { projectSlug?: string }).projectSlug
          return slug ? activeProjectFilters.has(slug) : false
        })
      : visibleNodes,
    [activeProjectFilters, visibleNodes],
  )

  const filteredEdges = useMemo(() => {
    if (activeProjectFilters.size === 0) return visibleEdges
    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    return visibleEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  }, [activeProjectFilters, filteredNodes, visibleEdges])

  useEffect(() => {
    setLayoutedNodes(filteredNodes)
    setLayoutedEdges(filteredEdges)
    updateStage('layout', {
      status: 'done',
      startedAt: Date.now(),
      completedAt: Date.now(),
      detail: nodesText(tRef.current, filteredNodes.length),
      progress: filteredNodes.length,
      progressTotal: filteredNodes.length,
    })
  }, [filteredNodes, filteredEdges, updateStage])

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
    // Workspace-specific
    projectMetas,
    activeProjectFilters,
    setActiveProjectFilters,
  }
}
