import { useMemo, useCallback, useState, useEffect, useRef, type MouseEvent } from 'react'
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
import { Clock, Bot, ExternalLink } from 'lucide-react'
import type { DependencyGraph, TaskStatus, ActiveAgentInfo, CrudEvent } from '@/types'
import { getEventBus } from '@/services'
import '@xyflow/react/dist/style.css'

// ============================================================================
// TYPES
// ============================================================================

export interface DependencyGraphViewProps {
  graph: DependencyGraph
  /** Fresh task statuses to override graph node statuses (e.g. from optimistic updates) */
  taskStatuses?: Map<string, TaskStatus>
  /** Callback when a node is clicked (replaces navigate) */
  onNodeSelect?: (taskId: string) => void
  className?: string
}

interface TaskNodeData extends Record<string, unknown> {
  label: string
  status: TaskStatus
  priority?: number
  taskId: string
  tags?: string[]
  stepCount?: number
  completedStepCount?: number
  assignedTo?: string
  activeAgent?: ActiveAgentInfo | null
  onSelect?: (taskId: string) => void
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
// RICH TOOLTIP
// ============================================================================

function TaskTooltip({ data }: { data: TaskNodeData }) {
  const colors = statusColors[data.status] || statusColors.pending
  const stepCount = data.stepCount ?? 0
  const completedStepCount = data.completedStepCount ?? 0

  return (
    <div
      className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ minWidth: 220, maxWidth: 300 }}
    >
      <div
        className="rounded-lg p-3 shadow-xl text-xs space-y-2"
        style={{
          background: '#1a1a2e',
          border: `1px solid ${colors.border}`,
        }}
      >
        {/* Status + Priority row */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: colors.dot }}
            />
            {statusLabels[data.status]}
          </span>
          {data.priority != null && data.priority > 0 && (
            <span className="text-[10px] text-gray-400">P{data.priority}</span>
          )}
        </div>

        {/* Title */}
        <p className="text-gray-200 font-medium leading-snug">{data.label}</p>

        {/* Agent indicator */}
        {data.activeAgent && (
          <div className="flex items-center gap-1.5 text-indigo-300">
            <Bot className="w-3 h-3" />
            <span>Agent active</span>
            {data.activeAgent.elapsedSecs != null && (
              <span className="flex items-center gap-0.5 text-gray-400">
                <Clock className="w-3 h-3" />
                {formatDuration(data.activeAgent.elapsedSecs)}
              </span>
            )}
            {data.activeAgent.costUsd != null && (
              <span className="text-gray-500 ml-auto">${data.activeAgent.costUsd.toFixed(3)}</span>
            )}
          </div>
        )}

        {/* Steps progress */}
        {stepCount > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-gray-400">
              <span>{completedStepCount}/{stepCount} steps</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: stepCount }, (_, i) => (
                <span key={i} className="text-[10px]">
                  {i < completedStepCount ? '\u2705' : '\u2B1C'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {data.tags && data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.08] text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Assigned to */}
        {data.assignedTo && (
          <div className="text-gray-500 text-[10px]">
            Assigned to: <span className="text-gray-300">{data.assignedTo}</span>
          </div>
        )}
      </div>
      {/* Tooltip arrow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
        style={{ background: '#1a1a2e', borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, bottom: -4 }}
      />
    </div>
  )
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

// ============================================================================
// CUSTOM NODE COMPONENT
// ============================================================================

function TaskNodeComponent({ data }: NodeProps<Node<TaskNodeData>>) {
  const [hovered, setHovered] = useState(false)
  const colors = statusColors[data.status] || statusColors.pending
  const isInProgress = data.status === 'in_progress'

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      data.onSelect?.(data.taskId)
    },
    [data],
  )

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip on hover */}
      {hovered && <TaskTooltip data={data} />}

      <div
        onClick={handleClick}
        className={`cursor-pointer transition-all duration-150 hover:scale-105 hover:shadow-lg ${isInProgress ? 'dep-node-pulse' : ''}`}
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
            className={isInProgress ? 'pulse-indicator relative inline-flex shrink-0' : ''}
            style={{ width: 8, height: 8 }}
          >
            {isInProgress && (
              <span
                className="pulse-ring absolute inset-0 rounded-full opacity-75"
                style={{ background: colors.dot }}
              />
            )}
            <span
              className="relative inline-flex rounded-full w-full h-full"
              style={{ background: colors.dot, width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
            />
          </div>
          <span
            className="text-xs font-medium"
            style={{ color: colors.text }}
          >
            {statusLabels[data.status]}
          </span>
          {data.activeAgent && (
            <Bot className="w-3 h-3 text-indigo-400 ml-0.5" />
          )}
          {data.priority != null && data.priority > 0 && (
            <span className="text-[10px] text-gray-500 ml-auto">P{data.priority}</span>
          )}
        </div>
        <p
          className="text-sm font-medium truncate"
          style={{ color: '#e5e7eb' }}
        >
          {data.label}
        </p>
        {/* Mini step progress bar */}
        {(data.stepCount ?? 0) > 0 && (
          <div className="mt-1.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((data.completedStepCount ?? 0) / (data.stepCount ?? 1)) * 100}%`,
                background: colors.dot,
              }}
            />
          </div>
        )}
        <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8 }} />
      </div>
    </div>
  )
}

const nodeTypes = { taskNode: TaskNodeComponent }

// ============================================================================
// TASK DRAWER
// ============================================================================

export interface TaskDrawerProps {
  taskId: string
  onClose: () => void
  onOpenFullPage: (taskId: string) => void
}

interface DrawerTask {
  id: string
  title?: string
  description: string
  status: TaskStatus
  acceptance_criteria: string[]
  tags: string[]
  affected_files: string[]
  assigned_to?: string
}

interface DrawerStep {
  id: string
  order: number
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
}

export function TaskDrawer({ taskId, onClose, onOpenFullPage }: TaskDrawerProps) {
  const [task, setTask] = useState<DrawerTask | null>(null)
  const [steps, setSteps] = useState<DrawerStep[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch task details + steps
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        // Dynamic import to avoid circular deps at module level
        const { tasksApi } = await import('@/services')
        const [details, stepsList] = await Promise.all([
          tasksApi.get(taskId),
          tasksApi.listSteps(taskId).catch(() => [] as DrawerStep[]),
        ])
        if (cancelled || !mountedRef.current) return
        setTask({
          id: details.id,
          title: details.title,
          description: details.description,
          status: details.status,
          acceptance_criteria: details.acceptance_criteria || [],
          tags: details.tags || [],
          affected_files: details.affected_files || [],
          assigned_to: details.assigned_to,
        })
        setSteps(Array.isArray(stepsList) ? stepsList : [])
      } catch (err) {
        console.error('[TaskDrawer] Failed to load task:', err)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [taskId])

  // Real-time step updates
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type === 'step' && event.action === 'updated') {
        const stepId = event.entity_id
        const newStatus = event.payload?.status as DrawerStep['status'] | undefined
        if (newStatus) {
          setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status: newStatus } : s)))
        }
      }
      if (event.entity_type === 'task' && event.entity_id === taskId && event.action === 'updated') {
        const newStatus = event.payload?.status as TaskStatus | undefined
        if (newStatus) {
          setTask((prev) => prev ? { ...prev, status: newStatus } : prev)
        }
      }
    })
    return () => { off() }
  }, [taskId])

  const handleStepToggle = useCallback(async (step: DrawerStep) => {
    const newStatus = step.status === 'completed' ? 'pending' : 'completed'
    // Optimistic update
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: newStatus } : s)))
    try {
      const { tasksApi } = await import('@/services')
      await tasksApi.updateStep(step.id, { status: newStatus })
    } catch {
      // Revert
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: step.status } : s)))
    }
  }, [])

  const taskColors = task ? statusColors[task.status] || statusColors.pending : statusColors.pending

  return (
    <div className="fixed top-0 right-0 h-full w-96 max-w-full z-40 flex flex-col bg-[#12121a] border-l border-white/[0.06] shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-sm font-medium text-gray-300 truncate">Task Details</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenFullPage(taskId)}
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
            title="Open full page"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-5 bg-white/[0.06] rounded w-3/4" />
            <div className="h-3 bg-white/[0.06] rounded w-full" />
            <div className="h-3 bg-white/[0.06] rounded w-2/3" />
          </div>
        ) : task ? (
          <>
            {/* Title + Status */}
            <div>
              <h3 className="text-base font-semibold text-gray-100 leading-snug mb-2">
                {task.title || task.description}
              </h3>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{ background: taskColors.bg, color: taskColors.text, border: `1px solid ${taskColors.border}` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: taskColors.dot }} />
                {statusLabels[task.status]}
              </span>
            </div>

            {/* Description */}
            {task.title && task.description && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Description</h4>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Steps */}
            {steps.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Steps ({steps.filter((s) => s.status === 'completed').length}/{steps.length})
                </h4>
                <div className="space-y-1">
                  {steps.map((step) => (
                    <button
                      key={step.id}
                      onClick={() => handleStepToggle(step)}
                      className="w-full flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left group"
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-colors ${
                        step.status === 'completed'
                          ? 'bg-green-600 border-green-600 text-white'
                          : step.status === 'in_progress'
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-gray-600 text-transparent group-hover:border-gray-500'
                      }`}>
                        {step.status === 'completed' ? '\u2713' : step.status === 'in_progress' ? '\u25CF' : ''}
                      </span>
                      <span className={`text-sm flex-1 ${step.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                        {step.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Acceptance criteria */}
            {task.acceptance_criteria.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Acceptance Criteria</h4>
                <ul className="space-y-1">
                  {task.acceptance_criteria.map((ac, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-gray-600 mt-0.5">&bull;</span>
                      <span>{ac}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags */}
            {task.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {task.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs bg-white/[0.08] text-gray-400">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Affected files */}
            {task.affected_files.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Affected Files ({task.affected_files.length})
                </h4>
                <div className="space-y-0.5">
                  {task.affected_files.slice(0, 10).map((f) => (
                    <p key={f} className="text-xs text-gray-400 font-mono truncate">{f}</p>
                  ))}
                  {task.affected_files.length > 10 && (
                    <p className="text-xs text-gray-600">+{task.affected_files.length - 10} more</p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">Failed to load task details</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DependencyGraphView({ graph, taskStatuses, onNodeSelect, className = '' }: DependencyGraphViewProps) {
  // Local status overrides from CrudEvents (real-time)
  const [liveStatuses, setLiveStatuses] = useState<Map<string, TaskStatus>>(new Map())
  // Local step progress from CrudEvents
  const [liveStepProgress, setLiveStepProgress] = useState<Map<string, { stepCount: number; completedStepCount: number }>>(new Map())

  // Listen for real-time task/step updates
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type === 'task' && event.action === 'updated') {
        const newStatus = event.payload?.status as TaskStatus | undefined
        if (newStatus) {
          setLiveStatuses((prev) => {
            const next = new Map(prev)
            next.set(event.entity_id, newStatus)
            return next
          })
        }
      }
      if (event.entity_type === 'step' && (event.action === 'updated' || event.action === 'progress')) {
        // If the payload has task-level progress info
        const taskId = event.payload?.task_id as string | undefined
        const total = event.payload?.total as number | undefined
        const completed = event.payload?.completed as number | undefined
        if (taskId && total != null && completed != null) {
          setLiveStepProgress((prev) => {
            const next = new Map(prev)
            next.set(taskId, { stepCount: total, completedStepCount: completed })
            return next
          })
        }
      }
    })
    return () => { off() }
  }, [])

  const { layoutedNodes, layoutedEdges, graphHeight } = useMemo(() => {
    // Resolve node status: prefer liveStatuses > taskStatuses > graph data
    const resolveStatus = (nodeId: string, graphStatus: TaskStatus): TaskStatus =>
      liveStatuses.get(nodeId) ?? taskStatuses?.get(nodeId) ?? graphStatus

    const rfNodes: Node<TaskNodeData>[] = (graph.nodes || []).map((node) => {
      const liveProgress = liveStepProgress.get(node.id)
      return {
        id: node.id,
        type: 'taskNode',
        position: { x: 0, y: 0 },
        data: {
          label: node.title || 'Untitled',
          status: resolveStatus(node.id, node.status),
          priority: node.priority,
          taskId: node.id,
          tags: node.tags,
          stepCount: liveProgress?.stepCount ?? node.stepCount,
          completedStepCount: liveProgress?.completedStepCount ?? node.completedStepCount,
          assignedTo: node.assignedTo,
          activeAgent: node.activeAgent,
          onSelect: onNodeSelect,
        },
      }
    })

    const rfEdges: Edge[] = (graph.edges || []).map((edge, index) => {
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

    const maxY = ln.reduce((max, n) => Math.max(max, n.position.y), 0)
    const calculatedHeight = Math.max(300, Math.min(700, maxY + 140))

    return { layoutedNodes: ln, layoutedEdges: le, graphHeight: calculatedHeight }
  }, [graph, taskStatuses, liveStatuses, liveStepProgress, onNodeSelect])

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
          className="dep-graph-controls"
        />
      </ReactFlow>
    </div>
  )
}
