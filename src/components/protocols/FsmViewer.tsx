/**
 * FsmViewer — Interactive FSM state machine viewer with macro-state drill-down.
 *
 * Renders protocol states as nodes and transitions as edges using @xyflow/react.
 * Macro-states (sub_protocol_id != null) are visually distinct: dashed border,
 * layers icon, and a violet background. Clicking a macro-state loads the
 * sub-protocol and renders a new FSM view with breadcrumb navigation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Layers, Circle, Square, Loader2 } from 'lucide-react'
import dagre from 'dagre'

import { FsmBreadcrumbs } from './FsmBreadcrumbs'
import type { FsmHierarchyCrumb } from './FsmBreadcrumbs'
import { protocolApi } from '@/services/protocolApi'
import type { Protocol, ProtocolState, ProtocolTransition } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FsmViewerProps {
  /** Initial protocol to render */
  protocol: Protocol
  className?: string
  /** State ID to highlight (from external navigation, e.g. spiral marker click) */
  highlightedStateId?: string | null
}

// ---------------------------------------------------------------------------
// Layout helper (dagre)
// ---------------------------------------------------------------------------

const NODE_WIDTH = 180
const NODE_HEIGHT = 60

function layoutGraph(
  states: ProtocolState[],
  transitions: ProtocolTransition[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 })

  for (const state of states) {
    g.setNode(state.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const t of transitions) {
    g.setEdge(t.from_state, t.to_state)
  }

  dagre.layout(g)

  const nodes: Node[] = states.map((state) => {
    const pos = g.node(state.id)
    const isMacro = !!state.sub_protocol_id

    return {
      id: state.id,
      type: 'fsmState',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: state.name,
        isInitial: state.state_type === 'start',
        isTerminal: state.state_type === 'terminal',
        isMacro,
        subProtocolId: state.sub_protocol_id,
        description: state.description,
      },
    }
  })

  const edges: Edge[] = transitions.map((t) => ({
    id: t.id,
    source: t.from_state,
    target: t.to_state,
    label: t.trigger,
    labelStyle: { fontSize: 10, fill: '#9ca3af', fontWeight: 400 },
    labelShowBg: false,
    style: { stroke: '#6b7280' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280', width: 16, height: 16 },
    animated: false,
  }))

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Custom Node: FsmStateNode
// ---------------------------------------------------------------------------

interface FsmStateNodeData {
  label: string
  isInitial: boolean
  isTerminal: boolean
  isMacro: boolean
  subProtocolId?: string | null
  description?: string
  isHighlighted?: boolean
  [key: string]: unknown
}

function FsmStateNode({ data }: { data: FsmStateNodeData }) {
  const { label, isInitial, isTerminal, isMacro, isHighlighted, description } = data

  // Visual configuration based on state type
  let bgClass = 'bg-white/[0.06]'
  let borderClass = 'border-white/10'
  let borderStyle = 'border'
  let icon = <Circle className="w-3 h-3 text-gray-400" />

  if (isMacro) {
    bgClass = 'bg-violet-500/10'
    borderClass = 'border-violet-400/40'
    borderStyle = 'border-2 border-dashed'
    icon = <Layers className="w-3.5 h-3.5 text-violet-400" />
  } else if (isInitial) {
    bgClass = 'bg-cyan-500/10'
    borderClass = 'border-cyan-400/40'
    icon = <Circle className="w-3 h-3 text-cyan-400 fill-cyan-400" />
  } else if (isTerminal) {
    bgClass = 'bg-green-500/10'
    borderClass = 'border-green-400/40'
    icon = <Square className="w-3 h-3 text-green-400" />
  }

  // Highlight override from external navigation (spiral marker click) — takes priority
  if (isHighlighted) {
    bgClass = 'bg-cyan-500/20'
    borderClass = 'border-cyan-400/60'
    borderStyle = 'border-2'
  }

  return (
    <div
      className={`
        ${bgClass} ${borderClass} ${borderStyle}
        rounded-lg px-3 py-2 min-w-[160px]
        ${isMacro ? 'cursor-pointer hover:bg-violet-500/20 transition-colors' : ''}
      `}
      title={description}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-200 truncate">{label}</span>
      </div>

      {isMacro && (
        <div className="text-[10px] text-violet-400/70 mt-1 flex items-center gap-1">
          <span>Click to drill down</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-gray-500 !w-2 !h-2 !border-0" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  fsmState: FsmStateNode,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FsmViewer({ protocol: initialProtocol, className = '', highlightedStateId }: FsmViewerProps) {
  const [protocolStack, setProtocolStack] = useState<Protocol[]>([initialProtocol])
  const [breadcrumbs, setBreadcrumbs] = useState<FsmHierarchyCrumb[]>([
    { protocolId: initialProtocol.id, protocolName: initialProtocol.name },
  ])
  const [loading, setLoading] = useState(false)

  // Reset when the initial protocol changes
  useEffect(() => {
    setProtocolStack([initialProtocol])
    setBreadcrumbs([{ protocolId: initialProtocol.id, protocolName: initialProtocol.name }])
  }, [initialProtocol])

  const currentProtocol = protocolStack[protocolStack.length - 1]

  // Compute layout
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutGraph(currentProtocol.states ?? [], currentProtocol.transitions ?? []),
    [currentProtocol],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Sync nodes/edges when protocol changes
  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  // Apply highlight when highlightedStateId changes
  useEffect(() => {
    if (highlightedStateId == null) return
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isHighlighted: node.id === highlightedStateId,
        },
      })),
    )
    // Auto-clear highlight after 3 seconds
    const timer = setTimeout(() => {
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          data: { ...node.data, isHighlighted: false },
        })),
      )
    }, 3000)
    return () => clearTimeout(timer)
  }, [highlightedStateId, setNodes])

  // Handle node click — drill down into macro-states
  const onNodeClick = useCallback(
    async (_: React.MouseEvent, node: Node) => {
      const data = node.data as FsmStateNodeData
      if (!data.isMacro || !data.subProtocolId) return

      setLoading(true)
      try {
        const subProtocol = await protocolApi.getProtocol(data.subProtocolId)

        setProtocolStack((prev) => [...prev, subProtocol])
        setBreadcrumbs((prev) => [
          ...prev,
          {
            protocolId: subProtocol.id,
            protocolName: subProtocol.name,
            parentStateName: data.label as string,
          },
        ])
      } catch (err) {
        console.error('Failed to load sub-protocol:', err)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Handle breadcrumb navigation
  const onBreadcrumbNavigate = useCallback((index: number) => {
    setProtocolStack((prev) => prev.slice(0, index + 1))
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
  }, [])

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Breadcrumbs */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle">
        <FsmBreadcrumbs
          mode="drill-down"
          hierarchy={breadcrumbs}
          onNavigate={onBreadcrumbNavigate}
          className="flex-1"
        />
        {loading && (
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Flow canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
          minZoom={0.3}
          maxZoom={2}
        >
          <Background color="#374151" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="!bg-white/[0.06] !border-white/10 !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button]:!text-gray-400 [&>button:hover]:!bg-white/[0.08]"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border-subtle text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <Circle className="w-2.5 h-2.5 text-cyan-400 fill-cyan-400" /> Initial
        </span>
        <span className="flex items-center gap-1">
          <Square className="w-2.5 h-2.5 text-green-400" /> Terminal
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-2.5 h-2.5 text-violet-400" /> Macro-state
        </span>
        <span className="flex items-center gap-1">
          <Circle className="w-2.5 h-2.5 text-gray-400" /> State
        </span>
      </div>
    </div>
  )
}
