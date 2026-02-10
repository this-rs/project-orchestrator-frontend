import { useMemo, useCallback, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import dagre from 'dagre'
import type { DependencyGraph } from '@/types'
import type { TaskStatus } from '@/types'
import '@xyflow/react/dist/style.css'

// ============================================================================
// TYPES
// ============================================================================

interface DependencyGraphViewProps {
  graph: DependencyGraph
  /** Fresh task statuses to override graph node statuses (e.g. from optimistic updates) */
  taskStatuses?: Map<string, TaskStatus>
  className?: string
}

interface TaskNodeData extends Record<string, unknown> {
  label: string
  status: TaskStatus
  priority?: number
  taskId: string
}

// ============================================================================
// STATUS COLORS (matching design system)
// ============================================================================

const statusColors: Record<TaskStatus, { bg: string; border: string; text: string; dot: string }> = {
  pending: { bg: '#1f2937', border: '#4b5563', text: '#d1d5db', dot: '#9ca3af' },
  in_progress: { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc', dot: '#818cf8' },
  blocked: { bg: '#422006', border: '#d97706', text: '#fcd34d', dot: '#f59e0b' },
  completed: { bg: '#052e16', border: '#22c55e', text: '#86efac', dot: '#4ade80' },
  failed: { bg: '#450a0a', border: '#ef4444', text: '#fca5a5', dot: '#f87171' },
}

const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
}

// ============================================================================
// DAGRE LAYOUT
// ============================================================================

function getLayoutedElements(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 })

  const nodeWidth = 240
  const nodeHeight = 60

  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ============================================================================
// CUSTOM NODE COMPONENT
// ============================================================================

function TaskNodeComponent({ data }: NodeProps<Node<TaskNodeData>>) {
  const navigate = useNavigate()
  const colors = statusColors[data.status] || statusColors.pending

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      navigate(`/tasks/${data.taskId}`)
    },
    [data.taskId, navigate],
  )

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer transition-all duration-150 hover:scale-105 hover:shadow-lg"
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 260,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 8, height: 8 }} />
      <div className="flex items-center gap-2 mb-1">
        <div
          style={{ background: colors.dot, width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
        />
        <span
          className="text-xs font-medium"
          style={{ color: colors.text }}
        >
          {statusLabels[data.status]}
        </span>
        {data.priority != null && data.priority > 0 && (
          <span className="text-[10px] text-gray-500 ml-auto">P{data.priority}</span>
        )}
      </div>
      <p
        className="text-sm font-medium truncate"
        style={{ color: '#e5e7eb' }}
        title={data.label}
      >
        {data.label}
      </p>
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8 }} />
    </div>
  )
}

const nodeTypes = { taskNode: TaskNodeComponent }

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DependencyGraphView({ graph, taskStatuses, className = '' }: DependencyGraphViewProps) {
  const { layoutedNodes, layoutedEdges, graphHeight } = useMemo(() => {
    // Resolve node status: prefer fresh taskStatuses (from optimistic updates), fallback to graph data
    const resolveStatus = (nodeId: string, graphStatus: TaskStatus): TaskStatus =>
      taskStatuses?.get(nodeId) ?? graphStatus

    const rfNodes: Node<TaskNodeData>[] = (graph.nodes || []).map((node) => ({
      id: node.id,
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: {
        label: node.title || 'Untitled',
        status: resolveStatus(node.id, node.status),
        priority: node.priority,
        taskId: node.id,
      },
    }))

    const rfEdges: Edge[] = (graph.edges || []).map((edge, index) => {
      // Find the source node to color the edge based on its resolved status
      const sourceNode = graph.nodes.find((n) => n.id === edge.from)
      const resolvedStatus = sourceNode ? resolveStatus(sourceNode.id, sourceNode.status) : 'pending'
      const edgeColor = statusColors[resolvedStatus]?.border || '#4b5563'

      return {
        id: `e-${index}`,
        source: edge.from,
        target: edge.to,
        animated: resolvedStatus === 'in_progress',
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 16,
          height: 16,
        },
      }
    })

    const { nodes: ln, edges: le } = getLayoutedElements(rfNodes, rfEdges, 'TB')

    // Calculate graph height based on node positions
    const maxY = ln.reduce((max, n) => Math.max(max, n.position.y), 0)
    const calculatedHeight = Math.max(300, Math.min(700, maxY + 140))

    return { layoutedNodes: ln, layoutedEdges: le, graphHeight: calculatedHeight }
  }, [graph, taskStatuses])

  if (layoutedNodes.length === 0) {
    return <p className="text-gray-500 text-sm">No tasks to display</p>
  }

  return (
    <div className={className} style={{ height: graphHeight }}>
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
      >
        <Background color="#374151" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: '#1f2937',
            borderRadius: 8,
            border: '1px solid #374151',
          }}
        />
      </ReactFlow>
    </div>
  )
}
