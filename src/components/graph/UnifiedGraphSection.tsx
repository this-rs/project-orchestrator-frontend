// ============================================================================
// UnifiedGraphSection — Generic graph container with DAG/Waves/3D toggle
// ============================================================================
//
// Extracted from PlanDetailPage's inline graph section. Renders:
//   1. Card with header (title + summary + view toggle)
//   2. EntityGroupPanel overlay for toggling entity categories
//   3. DAG (DependencyGraphView), Waves (WaveView), or 3D (IntelligenceGraph3D)
//   4. Fullscreen + brightness controls (3D only)
//
// Works with any GraphAdapter<T> — same component, different adapters.
// ============================================================================

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import { createPortal } from 'react-dom'
import { useSetAtom, useAtomValue, useAtom } from 'jotai'
import { Layers, Box, GitFork, ChevronRight, Maximize, Minimize, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Graph3DErrorBoundary } from '@/components/ui/Graph3DErrorBoundary'
import { EmptyState, ViewTabs, type ViewTab } from '@/components/ui'
import { glass, glassFlat, iconButton } from '@/components/ui/classes'
import { useT } from '@/i18n'
import { EntityGroupPanel } from './EntityGroupPanel'
import { useEntityGroups } from '@/hooks/useEntityGroups'
import { useActivationWebSocket } from '@/hooks/useActivationWebSocket'
import {
  selectedNodeIdAtom,
  intelligenceNodesAtom,
  selectedNodeAtom,
  highlightedGroupAtom,
  dimmedEntityTypesAtom,
  graphBrightnessAtom,
} from '@/atoms/intelligence'
import { ENTITY_GROUP_CONFIGS } from '@/types/fractal-graph'
import { NodeInspector } from '@/components/intelligence/NodeInspector'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceLayer } from '@/types/intelligence'
import type {
  GraphAdapter,
  FractalNode,
  FractalLink,
  FractalViewMode,
  ScaleLevel,
  EntityGroup,
} from '@/types/fractal-graph'
import type { DependencyGraph, WaveComputationResult, TaskStatus, PlanStatus } from '@/types'

// Lazy-load heavy 3D component
const IntelligenceGraph3D = lazy(() => import('@/components/intelligence/graph3d/IntelligenceGraph3D'))

// ── Layer mapping for FractalNode → IntelligenceNode conversion ──────────────

const LAYER_MAP: Record<string, IntelligenceLayer> = {
  plan: 'pm', task: 'pm', step: 'pm', milestone: 'pm', release: 'pm', commit: 'pm',
  file: 'code', function: 'code', struct: 'code', trait: 'code', enum: 'code', feature_graph: 'code',
  note: 'knowledge', decision: 'knowledge', constraint: 'knowledge',
  chat_session: 'chat',
  skill: 'skills',
  protocol: 'behavioral', protocol_state: 'behavioral',
}

// ── EntityGroup → entity type strings mapping ─────────────────────────────────

const GROUP_TO_ENTITY_TYPES = new Map<EntityGroup, Set<string>>()
for (const config of ENTITY_GROUP_CONFIGS) {
  GROUP_TO_ENTITY_TYPES.set(config.id, new Set(config.entityTypes))
}

/** Convert a set of EntityGroup IDs to a set of entity type strings */
function groupsToEntityTypes(groups: Set<EntityGroup>): Set<string> | null {
  if (groups.size === 0) return null
  const types = new Set<string>()
  for (const group of groups) {
    const groupTypes = GROUP_TO_ENTITY_TYPES.get(group)
    if (groupTypes) {
      for (const t of groupTypes) types.add(t)
    }
  }
  return types.size > 0 ? types : null
}

// ── Convert FractalNode[] → IntelligenceNode[] (for 3D renderer) ─────────────

function toIntelligenceNodes(nodes: FractalNode[]): IntelligenceNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'default' as const,
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      entityType: n.type,
      layer: LAYER_MAP[n.type] ?? 'pm',
      entityId: n.id,
      energy: n.energy ?? (n.data.energy as number) ?? 0.5,
      // Pass through all data fields
      ...n.data,
      // Explicit fields for NodeInspector / subtitle descendance
      status: n.status ?? n.data.status,
      step_count: n.data.step_count,
      completed_step_count: n.data.completed_step_count,
      priority: n.data.priority,
      path: n.data.path,
      sha: n.data.sha,
      message: n.data.message,
      chosen_option: n.data.chosen_option,
      severity: n.data.severity,
      note_count: n.data.note_count,
      decision_count: n.data.decision_count,
      affected_file_count: n.data.affected_file_count,
      commit_count: n.data.commit_count,
      task_count: n.data.task_count,
      completed_task_count: n.data.completed_task_count,
      plan_count: n.data.plan_count,
      file_count: n.data.file_count,
      function_count: n.data.function_count,
      struct_count: n.data.struct_count,
      verification: n.data.verification,
      note_type: n.data.note_type,
      importance: n.data.importance,
      state_count: n.data.state_count,
      energy_value: n.data.energy_value,
      cohesion: n.data.cohesion,
      model: n.data.model,
      messageCount: n.data.messageCount,
      totalCostUsd: n.data.totalCostUsd,
      costBasis: n.data.costBasis,
      description: n.data.description,
      entity_count: n.data.entity_count,
    } as Record<string, unknown>,
  })) as unknown as IntelligenceNode[]
}

function toIntelligenceEdges(links: FractalLink[]): IntelligenceEdge[] {
  return links.map((l, i) => ({
    id: `e-${l.source}-${l.target}-${i}`,
    source: l.source,
    target: l.target,
    data: {
      relationType: l.type,
      layer: 'pm',
      weight: l.weight,
    } as Record<string, unknown>,
  })) as unknown as IntelligenceEdge[]
}

// ── Breadcrumb types & component ──────────────────────────────────────────────

export interface GraphBreadcrumb {
  label: string
  href?: string
}

function GraphBreadcrumbs({ items }: { items: GraphBreadcrumb[] }) {
  const { t } = useT()
  if (items.length === 0) return null
  return (
    <nav aria-label={t('graph.unified.breadcrumbs')} className="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-3 md:px-4 py-1.5 text-xs text-gray-400 border-b border-white/[0.06] min-w-0">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" aria-hidden="true" />}
          {item.href ? (
            <Link
              to={item.href}
              title={item.label}
              className="py-1 hover:text-gray-200 transition-colors truncate max-w-[200px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-300 font-medium truncate max-w-[200px]" title={item.label}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface UnifiedGraphSectionProps<T> {
  /** The adapter that transforms data into FractalNode/FractalLink */
  adapter: GraphAdapter<T>
  /** Raw data to pass to the adapter */
  data: T
  /** Custom title (defaults to scale-level-based title) */
  title?: string
  /** Available view modes (defaults from SCALE_LEVEL_VIEWS) */
  availableViews?: FractalViewMode[]
  /** Default view mode */
  defaultView?: FractalViewMode

  // ── DAG-specific props (passed through to DependencyGraphView) ──────────
  /** Raw dependency graph for DAG view (DependencyGraphView consumes this directly) */
  graph?: DependencyGraph | null
  /** Task statuses for DAG/Waves views */
  taskStatuses?: Map<string, TaskStatus>

  // ── Waves-specific props ────────────────────────────────────────────────
  /** Waves data (lazily fetched) */
  waves?: WaveComputationResult | null
  /** Fetch waves callback (called when Waves button first clicked) */
  fetchWaves?: () => Promise<void>
  /** Waves loading state */
  wavesLoading?: boolean
  /** Plan ID (for WaveView) */
  planId?: string
  /** Plan status (for WaveView) */
  planStatus?: PlanStatus
  /** Active run ID (for WaveView runner link) */
  runId?: string
  /** Callback to launch the plan (opens ImplementDialog) */
  onLaunch?: () => void
  /** Whether a pipeline is currently running */
  isRunning?: boolean

  // ── Drill-down ──────────────────────────────────────────────────────────
  /** Called when user double-clicks a node with a drillTarget */
  onDrillDown?: (target: { level: ScaleLevel; id: string }) => void

  /** Breadcrumb trail showing navigation path (e.g. Milestone > Plan > Task) */
  breadcrumbs?: GraphBreadcrumb[]

  /** Project slug for activation WebSocket (enables spreading activation on fractal graphs) */
  projectSlug?: string

  /** Additional CSS class */
  className?: string
}

// Lazy imports for DAG/Waves (avoid circular deps, keep bundle small)
const DependencyGraphView = lazy(() =>
  import('@/components/DependencyGraphView').then((m) => ({ default: m.DependencyGraphView })),
)
const WaveView = lazy(() =>
  import('@/components/plans/WaveView').then((m) => ({ default: m.WaveView })),
)

// ── Component ────────────────────────────────────────────────────────────────

export function UnifiedGraphSection<T>({
  adapter,
  data,
  title,
  availableViews,
  defaultView,
  graph,
  taskStatuses,
  waves,
  fetchWaves,
  wavesLoading = false,
  planId,
  planStatus,
  runId,
  onLaunch,
  isRunning,
  onDrillDown,
  breadcrumbs,
  projectSlug,
  className = '',
}: UnifiedGraphSectionProps<T>) {
  const { t } = useT()
  // Lightweight WS for spreading activation on fractal graphs (plan/milestone/task pages)
  // Only connects when projectSlug is provided and 3D view is active
  useActivationWebSocket(projectSlug)

  const views = availableViews ?? ['dag', 'waves', '3d']
  const [viewMode, setViewMode] = useState<FractalViewMode>(defaultView ?? views[0])

  // Entity group 3-state toggle (off / connections / expanded)
  const { enabledGroups, groupModes, cycle, enableAll, resetToDefaults, groups } = useEntityGroups(adapter)

  // Compute nodes/links from adapter (enabledGroups includes both connections + expanded)
  const nodes = useMemo(() => adapter.toNodes(data, enabledGroups), [adapter, data, enabledGroups])
  const links = useMemo(() => adapter.toLinks(data, enabledGroups), [adapter, data, enabledGroups])
  const counts = useMemo(() => adapter.countByGroup(data), [adapter, data])

  // Build set of groups in "connections" mode (nodes should be dimmed via THREE.js)
  const connectionGroups = useMemo(() => {
    const set = new Set<EntityGroup>()
    for (const [group, mode] of groupModes) {
      if (mode === 'connections') set.add(group)
    }
    return set
  }, [groupModes])

  // Convert connection groups to entity type strings for the 3D dimming atom
  const dimmedTypes = useMemo(() => groupsToEntityTypes(connectionGroups), [connectionGroups])

  // Convert to Intelligence format for 3D (no energy manipulation — dimming is via THREE.js)
  const intelligenceNodes = useMemo(() => toIntelligenceNodes(nodes), [nodes])
  const intelligenceEdges = useMemo(() => toIntelligenceEdges(links), [links])

  // Atom management for NodeInspector
  const setIntelligenceNodes = useSetAtom(intelligenceNodesAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)
  const setHighlightedGroup = useSetAtom(highlightedGroupAtom)
  const setDimmedEntityTypes = useSetAtom(dimmedEntityTypesAtom)
  const [graphBrightness, setGraphBrightness] = useAtom(graphBrightnessAtom)

  // Fullscreen state
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v)
  }, [])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  // Sync dimmed entity types atom when connection groups change
  useEffect(() => {
    if (viewMode === '3d') {
      setDimmedEntityTypes(dimmedTypes)
    }
    return () => { setDimmedEntityTypes(null) }
  }, [dimmedTypes, setDimmedEntityTypes, viewMode])

  // Populate intelligenceNodesAtom for NodeInspector
  useEffect(() => {
    if (viewMode === '3d') {
      setIntelligenceNodes(intelligenceNodes)
    }
    return () => {
      setIntelligenceNodes((prev) => {
        if (prev.length > 0 && intelligenceNodes.length > 0 && prev[0]?.id === intelligenceNodes[0]?.id) {
          return []
        }
        return prev
      })
    }
  }, [intelligenceNodes, setIntelligenceNodes, viewMode])

  // Clear selection on data change
  useEffect(() => {
    setSelectedNodeId(null)
  }, [data, setSelectedNodeId])

  // Clear highlight + dimmed types on unmount
  useEffect(() => {
    return () => {
      setHighlightedGroup(null)
      setDimmedEntityTypes(null)
    }
  }, [setHighlightedGroup, setDimmedEntityTypes])

  // Handle drill-down: find node by id, check drillTarget, call onDrillDown
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (!onDrillDown) return
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.drillTarget) {
      onDrillDown(node.drillTarget)
    }
  }, [onDrillDown, nodes])

  // Handle 3D drill-down (intelligence node id → fractal node lookup)
  const handle3DNodeDoubleClick = useCallback((nodeId: string) => {
    handleNodeDoubleClick(nodeId)
  }, [handleNodeDoubleClick])

  // Handle waves button click
  const handleWavesClick = useCallback(() => {
    if (!waves && fetchWaves) {
      fetchWaves()
    }
    setViewMode('waves')
  }, [waves, fetchWaves])

  // Auto-fetch waves when switching to waves view without data
  useEffect(() => {
    if (viewMode === 'waves' && !waves && !wavesLoading && fetchWaves) {
      fetchWaves()
    }
  }, [viewMode, waves, wavesLoading, fetchWaves])

  const viewTabs: ViewTab<FractalViewMode>[] = [
    ...(views.includes('dag') ? [{ id: 'dag' as const, label: 'DAG', icon: <GitFork /> }] : []),
    ...(views.includes('waves')
      ? [{ id: 'waves' as const, label: wavesLoading ? t('graph.unified.computing') : t('graph.unified.waves'), icon: <Layers />, disabled: wavesLoading }]
      : []),
    ...(views.includes('3d') ? [{ id: '3d' as const, label: '3D', icon: <Box /> }] : []),
  ]
  const selectView = (id: FractalViewMode) => {
    if (id === 'waves') handleWavesClick()
    else setViewMode(id)
  }

  // Dynamic title
  const displayTitle = title ?? (
    viewMode === 'waves' ? t('graph.unified.wavesTitle')
    : viewMode === '3d' ? t('graph.unified.universeTitle')
    : t('graph.unified.dependencyTitle')
  )

  // Summary stats
  const summaryText = useMemo(() => {
    if (viewMode === 'waves' && waves) {
      return t('graph.unified.wavesSummary', { waves: waves.summary.total_waves, tasks: waves.summary.total_tasks })
    }
    if (viewMode === '3d') {
      return t('graph.unified.nodesSummary', { n: nodes.length })
    }
    return t('graph.unified.dagSummary', {
      tasks: counts.core - 1,
      deps: links.filter((l) => l.type === 'DEPENDS_ON').length,
    })
  }, [viewMode, waves, nodes.length, counts, links, t])

  // ── 3D content (shared between inline and fullscreen portal) ──────────────

  const graph3DContent = viewMode === '3d' ? (
    <div
      ref={containerRef}
      className={`bg-[#0a0a0f] ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'relative h-[360px] sm:h-[500px]'}`}
    >
      {/* EntityGroupPanel — horizontal segmented control stuck to top (its own glass; the bar has none) */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <EntityGroupPanel
            groups={groups}
            groupModes={groupModes}
            counts={counts}
            onCycle={cycle}
            onEnableAll={enableAll}
            onResetDefaults={resetToDefaults}
            direction="horizontal"
            enableHover
          />
        </div>
      </div>

      {/* 3D Graph */}
      <Graph3DErrorBoundary context="Unified Graph">
        <IntelligenceGraph3D
          nodes={intelligenceNodes}
          edges={intelligenceEdges}
          onNodeDoubleClick={onDrillDown ? handle3DNodeDoubleClick : undefined}
        />
      </Graph3DErrorBoundary>

      {/* NodeInspector for 3D */}
      {selectedNode && <NodeInspector />}

      {/* Controls (bottom-right): brightness slider + fullscreen */}
      <div className="absolute bottom-3 right-3 z-40 flex flex-col items-center gap-1.5">
        {/* Brightness slider (vertical) — a floating layer over the canvas: glass */}
        <div className={`${glass} flex flex-col items-center gap-1 rounded-lg p-1`}>
          <Sun size={12} className="text-gray-500 shrink-0" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={graphBrightness}
            onChange={(e) => setGraphBrightness(parseFloat(e.target.value))}
            className="graph-brightness-slider"
            title={t('graph.unified.brightnessValue', { percent: Math.round(graphBrightness * 100) })}
            aria-label={t('graph.unified.brightness')}
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              width: '14px',
              height: '80px',
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>
        {/* Fullscreen — one icon button over the canvas (secondary glass, flat: the canvas composites enough) */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`${iconButton('secondary', 'size-9 md:size-8')} ${glassFlat}`}
          title={isFullscreen ? t('graph.unified.exitFullscreen') : t('graph.unified.fullscreen')}
          aria-label={isFullscreen ? t('graph.unified.exitFullscreen') : t('graph.unified.fullscreen')}
        >
          {isFullscreen ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden ${className}`}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && <GraphBreadcrumbs items={breadcrumbs} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 md:px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-gray-200 truncate">{displayTitle}</h3>
          <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">{summaryText}</span>
        </div>

        {/* View mode — the segmented control of the design system */}
        <ViewTabs tabs={viewTabs} value={viewMode} onChange={selectView} label={t('graph.unified.view')} className="min-w-0" />
      </div>

      {/* Content */}
      <div className="relative">
        <Suspense
          fallback={
            <div className="h-[360px] sm:h-[400px] animate-pulse bg-white/[0.03]" aria-busy="true" aria-label={t('graph.unified.loading')} />
          }
        >
          {viewMode === '3d' ? (
            // In fullscreen, render via portal to escape parent stacking context
            isFullscreen ? createPortal(graph3DContent, document.body) : graph3DContent
          ) : viewMode === 'waves' && waves ? (
            <div className="p-4">
              <WaveView
                data={waves}
                taskStatuses={taskStatuses ?? new Map()}
                planId={planId ?? ''}
                planStatus={planStatus ?? ('approved' as PlanStatus)}
                runId={runId}
                onLaunch={onLaunch}
                isRunning={isRunning}
              />
            </div>
          ) : viewMode === 'dag' && graph ? (
            <div className="p-0">
              <DependencyGraphView
                graph={graph}
                taskStatuses={taskStatuses ?? new Map()}
                onNodeDoubleClick={onDrillDown ? handleNodeDoubleClick : undefined}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-[240px] sm:h-[400px]">
              <EmptyState size="sm" title={t('graph.unified.emptyTitle')} description={t('graph.unified.emptyDescription')} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
