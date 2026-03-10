// ============================================================================
// UnifiedGraphSection — Generic graph container with DAG/Waves/3D toggle
// ============================================================================
//
// Extracted from PlanDetailPage's inline graph section. Renders:
//   1. Card with header (title + summary + view toggle)
//   2. EntityGroupPanel overlay for toggling entity categories
//   3. DAG (DependencyGraphView), Waves (WaveView), or 3D (IntelligenceGraph3D)
//
// Works with any GraphAdapter<T> — same component, different adapters.
// ============================================================================

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import React from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Layers, Box, GitFork, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Graph3DErrorBoundary } from '@/components/ui/Graph3DErrorBoundary'
import { EntityGroupPanel } from './EntityGroupPanel'
import { useEntityGroups } from '@/hooks/useEntityGroups'
import { selectedNodeIdAtom, intelligenceNodesAtom, selectedNodeAtom, highlightedGroupAtom } from '@/atoms/intelligence'
import { NodeInspector } from '@/components/intelligence/NodeInspector'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceLayer } from '@/types/intelligence'
import type {
  GraphAdapter,
  FractalNode,
  FractalLink,
  FractalViewMode,
  ScaleLevel,
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
  if (items.length === 0) return null
  return (
    <nav className="flex items-center gap-1 px-4 py-1.5 text-xs text-gray-400 border-b border-gray-700/50 bg-gray-900/30">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />}
          {item.href ? (
            <Link
              to={item.href}
              className="hover:text-gray-200 transition-colors truncate max-w-[200px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-300 font-medium truncate max-w-[200px]">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

// ── View mode button ─────────────────────────────────────────────────────────

function ViewModeButton({
  label,
  icon,
  active,
  onClick,
  disabled,
  loading,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
        active
          ? 'bg-indigo-600 text-white font-medium shadow-sm'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {icon}
      {loading ? 'Computing...' : label}
    </button>
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

  // ── Drill-down ──────────────────────────────────────────────────────────
  /** Called when user double-clicks a node with a drillTarget */
  onDrillDown?: (target: { level: ScaleLevel; id: string }) => void

  /** Breadcrumb trail showing navigation path (e.g. Milestone > Plan > Task) */
  breadcrumbs?: GraphBreadcrumb[]

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
  onDrillDown,
  breadcrumbs,
  className = '',
}: UnifiedGraphSectionProps<T>) {
  const views = availableViews ?? ['dag', 'waves', '3d']
  const [viewMode, setViewMode] = useState<FractalViewMode>(defaultView ?? views[0])

  // Entity group toggle state
  const { enabledGroups, toggle, enableAll, resetToDefaults, groups } = useEntityGroups(adapter)

  // Compute nodes/links from adapter
  const nodes = useMemo(() => adapter.toNodes(data, enabledGroups), [adapter, data, enabledGroups])
  const links = useMemo(() => adapter.toLinks(data, enabledGroups), [adapter, data, enabledGroups])
  const counts = useMemo(() => adapter.countByGroup(data), [adapter, data])

  // Convert to Intelligence format for 3D
  const intelligenceNodes = useMemo(() => toIntelligenceNodes(nodes), [nodes])
  const intelligenceEdges = useMemo(() => toIntelligenceEdges(links), [links])

  // Atom management for NodeInspector
  const setIntelligenceNodes = useSetAtom(intelligenceNodesAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)
  const selectedNode = useAtomValue(selectedNodeAtom)
  const setHighlightedGroup = useSetAtom(highlightedGroupAtom)

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

  // Clear highlight on unmount
  useEffect(() => {
    return () => { setHighlightedGroup(null) }
  }, [setHighlightedGroup])

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
    } else {
      setViewMode('waves')
    }
  }, [waves, fetchWaves])

  // Switch to waves view when data loads
  useEffect(() => {
    if (waves && wavesLoading === false && viewMode !== 'waves') {
      // fetchWaves completed — auto-switch
    }
  }, [waves, wavesLoading, viewMode])

  // Dynamic title
  const displayTitle = title ?? (
    viewMode === 'waves' ? 'Execution Waves'
    : viewMode === '3d' ? '3D Universe'
    : 'Dependency Graph'
  )

  // Summary stats
  const summaryText = useMemo(() => {
    if (viewMode === 'waves' && waves) {
      return `${waves.summary.total_waves} waves · ${waves.summary.total_tasks} tasks`
    }
    if (viewMode === '3d') {
      return `${nodes.length} nodes`
    }
    return `${counts.core - 1} tasks · ${links.filter((l) => l.type === 'DEPENDS_ON').length} deps`
  }, [viewMode, waves, nodes.length, counts, links])

  return (
    <div className={`rounded-xl border border-gray-700/50 bg-gray-900/50 overflow-hidden ${className}`}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && <GraphBreadcrumbs items={breadcrumbs} />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">{displayTitle}</h3>
          <span className="text-xs text-gray-500">{summaryText}</span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg bg-gray-800/60 border border-gray-700/50 p-0.5">
          {views.includes('dag') && (
            <ViewModeButton

              label="DAG"
              icon={<GitFork className="w-3 h-3" />}
              active={viewMode === 'dag'}
              onClick={() => setViewMode('dag')}
            />
          )}
          {views.includes('waves') && (
            <ViewModeButton

              label="Waves"
              icon={<Layers className="w-3 h-3" />}
              active={viewMode === 'waves'}
              onClick={handleWavesClick}
              disabled={wavesLoading}
              loading={wavesLoading}
            />
          )}
          {views.includes('3d') && (
            <ViewModeButton

              label="3D"
              icon={<Box className="w-3 h-3" />}
              active={viewMode === '3d'}
              onClick={() => setViewMode('3d')}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative">
        {/* EntityGroupPanel overlay (only in 3D view — DAG/Waves don't need entity filtering) */}
        {viewMode === '3d' && (
          <div className="absolute top-3 left-3 z-30">
            <EntityGroupPanel
              groups={groups}
              enabledGroups={enabledGroups}
              counts={counts}
              onToggle={toggle}
              onEnableAll={enableAll}
              onResetDefaults={resetToDefaults}
              direction="vertical"
            />
          </div>
        )}

        {/* View content */}
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-gray-400 animate-pulse text-sm">Loading...</div>
            </div>
          }
        >
          {viewMode === '3d' ? (
            <div className="h-[500px] bg-[#0a0a0f]">
              <Graph3DErrorBoundary context="Unified Graph">
                <IntelligenceGraph3D
                  nodes={intelligenceNodes}
                  edges={intelligenceEdges}
                  onNodeDoubleClick={onDrillDown ? handle3DNodeDoubleClick : undefined}
                />
              </Graph3DErrorBoundary>
              {/* NodeInspector for 3D */}
              {selectedNode && <NodeInspector />}
            </div>
          ) : viewMode === 'waves' && waves ? (
            <div className="p-4">
              <WaveView
                data={waves}
                taskStatuses={taskStatuses ?? new Map()}
                planId={planId ?? ''}
                planStatus={planStatus ?? ('approved' as PlanStatus)}
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
            <div className="flex items-center justify-center h-[400px]">
              <p className="text-gray-500 text-sm">No data to visualize</p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
