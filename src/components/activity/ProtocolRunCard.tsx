/**
 * ProtocolRunCard — compact tile representing one live ProtocolRun (FSM) in
 * the Activity Hub.
 *
 * Shows
 * - Title (protocol name) + status badge + type icon (Workflow)
 * - Mini-FSM preview — xyflow read-only, nodes = recent / known states
 *   with the current state highlighted
 * - Elapsed time (live ticking)
 *
 * We don't have access to the full FSM topology from `RunState` alone — the
 * snapshot only carries `current_state`/`state_name`. We render a simple
 * "current state" pill plus a placeholder visit trail. When real FSM data is
 * available (future enhancement), this card can swap to a richer xyflow
 * render without changing the parent dispatcher.
 */

import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Workflow, Circle, Play } from 'lucide-react'
import type { RunState } from '@/hooks/useActivityStream'
import { CardFrame, CostChip, ElapsedChip, StatusBadge } from './RunCardShared'

// ---------------------------------------------------------------------------
// Custom FSM state node — tiny pill with optional highlight.
// ---------------------------------------------------------------------------

interface StateNodeData extends Record<string, unknown> {
  label: string
  current: boolean
  terminal?: boolean
}

function StateNode({ data }: NodeProps<Node<StateNodeData>>) {
  const cfg = data.current
    ? { bg: '#1e1b4b', border: '#a78bfa', text: '#e9d5ff', shadow: 'rgba(167,139,250,0.5)' }
    : data.terminal
      ? { bg: '#052e16', border: '#22c55e', text: '#bbf7d0', shadow: 'transparent' }
      : { bg: '#1f2937', border: '#4b5563', text: '#9ca3af', shadow: 'transparent' }

  return (
    <div
      className="px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        boxShadow: data.current ? `0 0 10px ${cfg.shadow}` : undefined,
        minWidth: 50,
        textAlign: 'center',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: cfg.border, width: 4, height: 4 }} />
      <Handle type="source" position={Position.Right} style={{ background: cfg.border, width: 4, height: 4 }} />
      {data.label}
    </div>
  )
}

const NODE_TYPES = { state: StateNode } as const

// ---------------------------------------------------------------------------
// Mini-FSM — generate a chain start → current → ... with highlight.
// ---------------------------------------------------------------------------

function useMiniFsm(run: RunState): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const stateName = run.state_name || run.current_state || 'state'

    // We synthesize a 3-node chain: start → current → ? — the middle highlighted.
    // This is intentional: the snapshot doesn't include the full FSM, so we
    // give the user a visual anchor without inventing topology.
    const NODE_W = 70
    const GAP = 14
    const Y = 30

    const nodes: Node[] = [
      {
        id: 'start',
        type: 'state',
        position: { x: 0, y: Y },
        data: { label: '○ start', current: false } satisfies StateNodeData,
        draggable: false,
        selectable: false,
      },
      {
        id: 'current',
        type: 'state',
        position: { x: NODE_W + GAP, y: Y },
        data: {
          label: stateName.length > 12 ? stateName.slice(0, 11) + '…' : stateName,
          current: true,
        } satisfies StateNodeData,
        draggable: false,
        selectable: false,
      },
      {
        id: 'next',
        type: 'state',
        position: { x: 2 * (NODE_W + GAP), y: Y },
        data: { label: '? next', current: false } satisfies StateNodeData,
        draggable: false,
        selectable: false,
      },
    ]

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'start',
        target: 'current',
        style: { stroke: '#6366f1', strokeWidth: 1.5 },
        animated: run.status === 'running',
      },
      {
        id: 'e2',
        source: 'current',
        target: 'next',
        style: { stroke: '#374151', strokeWidth: 1, strokeDasharray: '3 3' },
      },
    ]
    return { nodes, edges }
  }, [run.state_name, run.current_state, run.status])
}

function MiniFsm({ run }: { run: RunState }) {
  const { nodes, edges } = useMiniFsm(run)

  return (
    <div className="h-[80px] w-full overflow-hidden rounded border border-white/[0.04]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
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

export interface ProtocolRunCardProps {
  run: RunState
  onClick?: () => void
}

export function ProtocolRunCard({ run, onClick }: ProtocolRunCardProps) {
  const isRunning = run.status === 'running'

  return (
    <CardFrame
      onClick={onClick}
      accent="purple"
      ariaLabel={`Protocol run: ${run.title}`}
    >
      <div className="flex flex-col p-3 gap-2 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Workflow className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-100 leading-snug truncate">
                {run.title || 'Protocol run'}
              </h3>
              {run.state_name && (
                <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                  {isRunning ? (
                    <Play className="w-2.5 h-2.5 text-purple-400" />
                  ) : (
                    <Circle className="w-2.5 h-2.5" />
                  )}
                  <span className="truncate">State: {run.state_name}</span>
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={run.status} />
        </div>

        {/* Mini-FSM */}
        <MiniFsm run={run} />

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between text-[10px] text-gray-500">
          <ElapsedChip startedAt={run.started_at} isRunning={isRunning} />
          <CostChip usd={run.cost_usd} />
        </div>
      </div>
    </CardFrame>
  )
}

export default ProtocolRunCard
