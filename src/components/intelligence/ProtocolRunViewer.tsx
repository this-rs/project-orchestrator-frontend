// ============================================================================
// PROTOCOL RUN VIEWER — Real-time FSM visualization
// ============================================================================
//
// Displays a protocol's finite state machine with:
// - States rendered as rounded boxes (start=green, intermediate=orange, terminal=red)
// - Transitions as labeled arrows between states
// - Active state pulsing when a run is in progress
// - Visited states highlighted with a glow trail
// - Progress bar overlay when sub-action progress is reported
//
// Layout: horizontal dagre-like arrangement using a simple topological sort
// ============================================================================

import { memo, useEffect, useMemo, useState } from 'react'
import {
  Play,
  Circle,
  Square,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  Zap,
} from 'lucide-react'
import type {
  ProtocolDetailApi,
  ProtocolStateApi,
  ProtocolRunApi,
  ProtocolRunProgress,
} from '@/types/intelligence'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_W = 140
const STATE_H = 56
const H_GAP = 60
const V_GAP = 80
const PADDING = 24

const stateTypeIcons: Record<string, typeof Circle> = {
  start: Play,
  intermediate: Circle,
  terminal: Square,
}

const stateColors = {
  start: { bg: '#052e16', border: '#22C55E', text: '#4ade80', glow: '#22C55E40' },
  intermediate: { bg: '#1c1105', border: '#F97316', text: '#FB923C', glow: '#F9731640' },
  terminal: { bg: '#1c0505', border: '#EF4444', text: '#F87171', glow: '#EF444440' },
} as const

const runStatusColors: Record<string, { color: string; bg: string }> = {
  running: { color: '#22D3EE', bg: '#164E63' },
  completed: { color: '#4ade80', bg: '#052e16' },
  failed: { color: '#F87171', bg: '#450a0a' },
  cancelled: { color: '#94A3B8', bg: '#1e293b' },
}

const runStatusIcons: Record<string, typeof Loader2> = {
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
}

// ============================================================================
// LAYOUT — Simple topological positioning
// ============================================================================

interface LayoutNode {
  id: string
  state: ProtocolStateApi
  x: number
  y: number
}

interface LayoutEdge {
  from: LayoutNode
  to: LayoutNode
  trigger: string
  guard?: string
}

function layoutFSM(
  states: ProtocolStateApi[],
  transitions: { from_state: string; to_state: string; trigger: string; guard?: string }[],
  entryStateId: string,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (states.length === 0) return { nodes: [], edges: [], width: 200, height: 100 }

  // Build adjacency + in-degree
  const adj = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  for (const s of states) {
    adj.set(s.id, [])
    inDeg.set(s.id, 0)
  }
  for (const t of transitions) {
    adj.get(t.from_state)?.push(t.to_state)
    inDeg.set(t.to_state, (inDeg.get(t.to_state) ?? 0) + 1)
  }

  // BFS from entry state to assign layers (columns)
  // Standard BFS: each node is visited at most once to prevent infinite loops on cyclic FSMs
  const layer = new Map<string, number>()
  const visited = new Set<string>()
  const queue: string[] = [entryStateId]
  layer.set(entryStateId, 0)
  visited.add(entryStateId)
  while (queue.length > 0) {
    const cur = queue.shift()!
    const curLayer = layer.get(cur)!
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        layer.set(next, curLayer + 1)
        queue.push(next)
      }
    }
  }

  // Assign layer 0 to any orphan states not reachable from entry
  for (const s of states) {
    if (!layer.has(s.id)) layer.set(s.id, 0)
  }

  // Group states by layer
  const layers = new Map<number, ProtocolStateApi[]>()
  for (const s of states) {
    const l = layer.get(s.id)!
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l)!.push(s)
  }

  const maxLayer = Math.max(...layers.keys(), 0)
  let maxRowCount = 0

  // Position nodes
  const nodeMap = new Map<string, LayoutNode>()
  for (let col = 0; col <= maxLayer; col++) {
    const colStates = layers.get(col) ?? []
    maxRowCount = Math.max(maxRowCount, colStates.length)
    const colX = PADDING + col * (STATE_W + H_GAP)
    for (let row = 0; row < colStates.length; row++) {
      const colY = PADDING + row * (STATE_H + V_GAP)
      const node: LayoutNode = { id: colStates[row].id, state: colStates[row], x: colX, y: colY }
      nodeMap.set(colStates[row].id, node)
    }
  }

  const nodes = Array.from(nodeMap.values())

  // Build edges
  const edges: LayoutEdge[] = []
  for (const t of transitions) {
    const from = nodeMap.get(t.from_state)
    const to = nodeMap.get(t.to_state)
    if (from && to) {
      edges.push({ from, to, trigger: t.trigger, guard: t.guard })
    }
  }

  const width = PADDING * 2 + (maxLayer + 1) * STATE_W + maxLayer * H_GAP
  const height = PADDING * 2 + maxRowCount * STATE_H + (maxRowCount - 1) * V_GAP

  return { nodes, edges, width: Math.max(width, 200), height: Math.max(height, 100) }
}

// ============================================================================
// SVG ARROW RENDERING
// ============================================================================

function TransitionArrow({
  from,
  to,
  trigger,
  guard,
  isActive,
}: {
  from: LayoutNode
  to: LayoutNode
  trigger: string
  guard?: string
  isActive: boolean
}) {
  const fromCx = from.x + STATE_W / 2
  const fromCy = from.y + STATE_H / 2
  const toCy = to.y + STATE_H / 2

  // Edge from right side to left side
  const x1 = from.x + STATE_W
  const y1 = fromCy
  const x2 = to.x
  const y2 = toCy

  // Self-loop
  if (from.id === to.id) {
    const loopR = 20
    const sx = fromCx
    const sy = from.y
    return (
      <g>
        <path
          d={`M ${sx} ${sy} C ${sx - loopR} ${sy - 40} ${sx + loopR} ${sy - 40} ${sx} ${sy}`}
          fill="none"
          stroke={isActive ? '#22D3EE' : '#475569'}
          strokeWidth={isActive ? 2 : 1.5}
          markerEnd="url(#arrowhead)"
          opacity={isActive ? 1 : 0.6}
        />
        <text
          x={sx}
          y={sy - 34}
          textAnchor="middle"
          fill={isActive ? '#22D3EE' : '#64748B'}
          fontSize={9}
          fontFamily="ui-monospace, monospace"
        >
          {trigger}
        </text>
      </g>
    )
  }

  // Curved path for vertical offset
  const dx = x2 - x1
  const isSameCol = Math.abs(dx) < 10
  const cx1 = x1 + dx * 0.3
  const cy1 = isSameCol ? y1 - 30 : y1
  const cx2 = x1 + dx * 0.7
  const cy2 = isSameCol ? y2 + 30 : y2

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2 + (isSameCol ? -20 : -12)

  return (
    <g>
      <path
        d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
        fill="none"
        stroke={isActive ? '#22D3EE' : '#475569'}
        strokeWidth={isActive ? 2 : 1.5}
        markerEnd="url(#arrowhead)"
        opacity={isActive ? 1 : 0.6}
        className={isActive ? 'fsm-edge-active' : undefined}
      />
      <text
        x={midX}
        y={midY}
        textAnchor="middle"
        fill={isActive ? '#22D3EE' : '#64748B'}
        fontSize={9}
        fontFamily="ui-monospace, monospace"
      >
        {trigger}
        {guard && (
          <tspan fill="#6B7280" fontSize={8}>
            {' '}[{guard}]
          </tspan>
        )}
      </text>
    </g>
  )
}

// ============================================================================
// STATE NODE
// ============================================================================

function StateBox({
  node,
  isVisited,
  isCurrent,
  progress,
}: {
  node: LayoutNode
  isVisited: boolean
  isCurrent: boolean
  progress?: ProtocolRunProgress
}) {
  const st = node.state
  const type = (st.state_type ?? 'intermediate') as keyof typeof stateColors
  const colors = stateColors[type] ?? stateColors.intermediate
  const Icon = stateTypeIcons[st.state_type] ?? Circle

  const borderColor = isCurrent
    ? '#22D3EE'
    : isVisited
      ? colors.border
      : `${colors.border}60`

  const bgColor = isCurrent
    ? '#0c2d3e'
    : isVisited
      ? colors.bg
      : '#0f172a'

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : undefined

  return (
    <g>
      {/* Glow for active/current state */}
      {isCurrent && (
        <rect
          x={node.x - 4}
          y={node.y - 4}
          width={STATE_W + 8}
          height={STATE_H + 8}
          rx={14}
          fill="none"
          stroke="#22D3EE"
          strokeWidth={2}
          opacity={0.4}
          className="fsm-state-pulse"
        />
      )}
      {isVisited && !isCurrent && (
        <rect
          x={node.x - 2}
          y={node.y - 2}
          width={STATE_W + 4}
          height={STATE_H + 4}
          rx={12}
          fill="none"
          stroke={colors.border}
          strokeWidth={1}
          opacity={0.25}
        />
      )}

      {/* Main box */}
      <rect
        x={node.x}
        y={node.y}
        width={STATE_W}
        height={STATE_H}
        rx={10}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isCurrent ? 2.5 : isVisited ? 2 : 1.5}
      />

      {/* Progress bar overlay */}
      {progressPct !== undefined && isCurrent && (
        <g>
          <rect
            x={node.x + 4}
            y={node.y + STATE_H - 10}
            width={STATE_W - 8}
            height={4}
            rx={2}
            fill="#1e293b"
          />
          <rect
            x={node.x + 4}
            y={node.y + STATE_H - 10}
            width={Math.max(2, ((STATE_W - 8) * progressPct) / 100)}
            height={4}
            rx={2}
            fill="#22D3EE"
            className="fsm-progress-bar"
          />
        </g>
      )}

      {/* Icon + state name */}
      <foreignObject x={node.x} y={node.y} width={STATE_W} height={STATE_H - (progressPct !== undefined ? 8 : 0)}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '4px 8px',
            gap: 2,
          }}
        >
          <Icon
            size={14}
            color={isCurrent ? '#22D3EE' : isVisited ? colors.text : `${colors.text}80`}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: isCurrent ? '#22D3EE' : isVisited ? colors.text : `${colors.text}80`,
              textAlign: 'center',
              lineHeight: 1.2,
              maxWidth: STATE_W - 16,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {st.name}
          </span>
          {progressPct !== undefined && isCurrent && (
            <span style={{ fontSize: 8, color: '#67e8f9', fontFamily: 'ui-monospace, monospace' }}>
              {progress!.sub_action} {progress!.display}
            </span>
          )}
        </div>
      </foreignObject>
    </g>
  )
}

// ============================================================================
// RUN STATUS BADGE
// ============================================================================

function RunStatusBadge({ run }: { run: ProtocolRunApi }) {
  const colors = runStatusColors[run.status] ?? runStatusColors.running
  const StatusIcon = runStatusIcons[run.status] ?? Loader2
  // Use state + interval for live elapsed time (avoids impure Date.now() in render)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (run.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [run.status])
  const elapsed = run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : Math.round((now - new Date(run.started_at).getTime()) / 1000)

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
      style={{ backgroundColor: colors.bg, borderColor: `${colors.color}40` }}
    >
      <StatusIcon
        size={12}
        color={colors.color}
        className={run.status === 'running' ? 'animate-spin' : undefined}
      />
      <span style={{ color: colors.color }} className="text-[10px] font-semibold uppercase tracking-wider">
        {run.status}
      </span>
      <span className="text-[9px] text-slate-500 ml-1">
        <Clock size={8} className="inline mr-0.5" />
        {elapsed}s
      </span>
      {run.triggered_by && run.triggered_by !== 'manual' && (
        <span className="text-[8px] text-slate-600 font-mono ml-auto flex items-center gap-0.5">
          <Zap size={7} />
          {run.triggered_by}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ProtocolRunViewerProps {
  /** Protocol definition (states + transitions) */
  protocol: ProtocolDetailApi
  /** Active run (optional — if provided, states light up) */
  activeRun?: ProtocolRunApi | null
  /** Real-time progress for the current state */
  progress?: ProtocolRunProgress | null
  /** Compact mode for embedding in cards */
  compact?: boolean
}

function ProtocolRunViewerComponent({
  protocol,
  activeRun,
  progress,
  compact = false,
}: ProtocolRunViewerProps) {
  const { nodes, edges, width, height } = useMemo(
    () => layoutFSM(protocol.states, protocol.transitions, protocol.entry_state),
    [protocol.states, protocol.transitions, protocol.entry_state],
  )

  // Determine active/visited states from the run
  const visitedStateIds = useMemo(() => {
    if (!activeRun) return new Set<string>()
    return new Set(activeRun.states_visited.map((v) => v.state_id))
  }, [activeRun])

  const currentStateId = activeRun?.current_state

  // Active transitions: from visited states going forward
  const activeEdgeKeys = useMemo(() => {
    if (!activeRun) return new Set<string>()
    const keys = new Set<string>()
    const visited = activeRun.states_visited
    for (let i = 1; i < visited.length; i++) {
      keys.add(`${visited[i - 1].state_id}:${visited[i].state_id}`)
    }
    return keys
  }, [activeRun])

  const svgH = compact ? Math.min(height, 200) : height

  return (
    <div className="space-y-2">
      {/* Run status badge */}
      {activeRun && <RunStatusBadge run={activeRun} />}

      {/* SVG FSM Diagram */}
      <div
        className="rounded-lg border border-slate-800 bg-slate-950/50 overflow-auto"
        style={{ maxHeight: compact ? 200 : 400 }}
      >
        <svg
          width={width}
          height={svgH}
          viewBox={`0 0 ${width} ${svgH}`}
          className="fsm-viewer"
        >
          {/* Defs */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#475569" />
            </marker>
            <marker
              id="arrowhead-active"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#22D3EE" />
            </marker>
          </defs>

          {/* Edges (rendered first = behind) */}
          {edges.map((edge, i) => {
            const isEdgeActive = activeEdgeKeys.has(`${edge.from.id}:${edge.to.id}`)
            return (
              <TransitionArrow
                key={`${edge.from.id}-${edge.to.id}-${i}`}
                from={edge.from}
                to={edge.to}
                trigger={edge.trigger}
                guard={edge.guard}
                isActive={isEdgeActive}
              />
            )
          })}

          {/* State nodes */}
          {nodes.map((node) => (
            <StateBox
              key={node.id}
              node={node}
              isVisited={visitedStateIds.has(node.id)}
              isCurrent={node.id === currentStateId}
              progress={
                progress && node.id === currentStateId ? progress : undefined
              }
            />
          ))}
        </svg>
      </div>

      {/* Visited states trace (compact) */}
      {activeRun && activeRun.states_visited.length > 0 && !compact && (
        <div className="flex items-center gap-1 flex-wrap px-1">
          {activeRun.states_visited.map((v, i) => (
            <div key={v.state_id + i} className="flex items-center gap-1">
              {i > 0 && <ArrowRight size={8} className="text-slate-700" />}
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: v.state_id === currentStateId ? '#164E63' : '#1e293b',
                  color: v.state_id === currentStateId ? '#22D3EE' : '#94A3B8',
                  border: `1px solid ${v.state_id === currentStateId ? '#22D3EE40' : '#334155'}`,
                }}
              >
                {v.state_name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {activeRun?.error && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-md px-2 py-1.5">
          <span className="text-[10px] text-red-400">{activeRun.error}</span>
        </div>
      )}
    </div>
  )
}

export const ProtocolRunViewer = memo(ProtocolRunViewerComponent)

// ============================================================================
// CSS ANIMATIONS (inject into page via style tag pattern)
// These will be added to IntelligenceGraphPage.tsx keyframes
// ============================================================================

export const FSM_VIEWER_STYLES = `
  @keyframes fsm-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }
  .fsm-state-pulse {
    animation: fsm-pulse 2s ease-in-out infinite;
  }
  @keyframes fsm-edge-flow {
    to { stroke-dashoffset: -16; }
  }
  .fsm-edge-active {
    stroke-dasharray: 8 4;
    animation: fsm-edge-flow 1s linear infinite;
  }
  @keyframes fsm-progress {
    0% { opacity: 0.8; }
    50% { opacity: 1; }
    100% { opacity: 0.8; }
  }
  .fsm-progress-bar {
    animation: fsm-progress 1.5s ease-in-out infinite;
  }
`
