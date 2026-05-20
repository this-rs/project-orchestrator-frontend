/**
 * PlanRunCard — compact tile representing one live PlanRun in the Activity Hub.
 *
 * Shows
 * - Title (plan title) + status badge + type icon (ClipboardList)
 * - Mini-DAG preview — xyflow read-only, nodes = task slots in the current
 *   wave, color-coded by task status (pending / running / completed / failed)
 * - Progress bar — completed_tasks / total_tasks
 * - Elapsed time (live ticking via `useElapsedTime`)
 * - Cost (`cost_usd`) when > $0
 *
 * Target size: 320x180px (compact). The mini-DAG is intentionally not
 * interactive — clicking the card navigates to the full runner dashboard
 * for that plan run.
 *
 * Performance: nodes for the DAG are derived from `RunState` (completed_tasks
 * / failed_tasks counts), NOT from the full backend dependency graph. We
 * render up to MAX_NODES placeholder nodes representing the current wave; a
 * cheap visualisation that keeps the card under the 30fps render budget
 * mentioned in the task constraint.
 */

import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ClipboardList, AlertTriangle } from 'lucide-react'
import { ProgressBar } from '@/components/ui'
import type { RunState } from '@/hooks/useActivityStream'
import { CardFrame, CostChip, ElapsedChip, StatusBadge } from './RunCardShared'

// ---------------------------------------------------------------------------
// Mini-DAG configuration
// ---------------------------------------------------------------------------

/** Soft cap on rendered nodes — keeps the DAG cheap and legible. */
const MAX_NODES = 8

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  pending:     { bg: '#1f2937', border: '#4b5563' },
  running:     { bg: '#1e1b4b', border: '#6366f1' },
  completed:   { bg: '#052e16', border: '#22c55e' },
  failed:      { bg: '#450a0a', border: '#ef4444' },
}

/**
 * Build a tiny grid-like DAG representing the run's task slots.
 *
 * We don't know the per-task wave layout from the aggregated `RunState`, so
 * we use a single row of N nodes where N = `Math.min(total_tasks, MAX_NODES)`
 * and color them in order: completed first, then failed, then the rest are
 * pending (the in-progress slot is highlighted at the cursor position).
 */
function useMiniDagNodes(run: RunState): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const total = Math.min(run.total_tasks ?? 0, MAX_NODES)
    if (total <= 0) return { nodes: [], edges: [] }

    const completed = Math.min(run.completed_tasks ?? 0, total)
    const failed = Math.min(run.failed_tasks ?? 0, Math.max(0, total - completed))
    const hasRunning = !!run.current_task_id

    const NODE_SIZE = 18
    const GAP = 10
    const Y = 25 // centered vertically in the ~80px DAG area

    const nodes: Node[] = []
    const edges: Edge[] = []

    for (let i = 0; i < total; i++) {
      let status: string
      if (i < completed) status = 'completed'
      else if (i < completed + failed) status = 'failed'
      else if (hasRunning && i === completed + failed) status = 'running'
      else status = 'pending'

      const c = NODE_COLORS[status] ?? NODE_COLORS.pending
      nodes.push({
        id: `n${i}`,
        position: { x: i * (NODE_SIZE + GAP), y: Y },
        data: { label: '' },
        draggable: false,
        selectable: false,
        connectable: false,
        style: {
          width: NODE_SIZE,
          height: NODE_SIZE,
          background: c.bg,
          border: `2px solid ${c.border}`,
          borderRadius: 4,
          padding: 0,
          fontSize: 10,
          color: 'transparent',
          boxShadow: status === 'running' ? `0 0 8px ${c.border}80` : undefined,
        },
      })

      if (i > 0) {
        edges.push({
          id: `e${i - 1}-${i}`,
          source: `n${i - 1}`,
          target: `n${i}`,
          style: { stroke: '#374151', strokeWidth: 1 },
          // Disable interaction
          selectable: false,
          deletable: false,
        })
      }
    }
    return { nodes, edges }
  }, [run.total_tasks, run.completed_tasks, run.failed_tasks, run.current_task_id])
}

// ---------------------------------------------------------------------------
// Mini-DAG component
// ---------------------------------------------------------------------------

function MiniDag({ run }: { run: RunState }) {
  const { nodes, edges } = useMiniDagNodes(run)

  if (nodes.length === 0) {
    return (
      <div className="h-[80px] flex items-center justify-center text-[10px] text-gray-600 border border-dashed border-white/[0.06] rounded">
        Waiting for tasks…
      </div>
    )
  }

  // The xyflow viewport is centered manually via `fitView`. We disable all
  // user interaction so the DAG behaves as a static preview.
  return (
    <div className="h-[80px] w-full overflow-hidden rounded border border-white/[0.04]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={false}
        panOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background gap={12} size={1} color="rgba(255,255,255,0.03)" />
      </ReactFlow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface PlanRunCardProps {
  run: RunState
  onClick?: () => void
}

export function PlanRunCard({ run, onClick }: PlanRunCardProps) {
  const total = run.total_tasks ?? 0
  const completed = run.completed_tasks ?? 0
  const failed = run.failed_tasks ?? 0
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0

  const isRunning = run.status === 'running'
  const hasFailures = failed > 0
  const accent = hasFailures && !isRunning ? 'purple' : 'indigo'

  return (
    <CardFrame
      onClick={onClick}
      accent={accent}
      ariaLabel={`Plan run: ${run.title}`}
    >
      <div className="flex flex-col p-3 gap-2 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <ClipboardList className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-100 leading-snug truncate">
                {run.title || 'Plan run'}
              </h3>
              {run.current_wave != null && total > 0 && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Wave {run.current_wave} · {completed}/{total} tasks
                  {failed > 0 && (
                    <span className="text-red-400 ml-1 inline-flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {failed}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={run.status} />
        </div>

        {/* Mini-DAG */}
        <MiniDag run={run} />

        {/* Progress + footer */}
        <div className="mt-auto space-y-1.5">
          <ProgressBar value={progress} size="sm" shimmer={isRunning} gradient />
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <ElapsedChip startedAt={run.started_at} isRunning={isRunning} />
            <CostChip usd={run.cost_usd} />
          </div>
        </div>
      </div>
    </CardFrame>
  )
}

export default PlanRunCard
