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
import { Link } from 'react-router-dom'
import { AlertTriangle, FileCode2, StickyNote, BookOpen, ExternalLink, CheckCircle2, Circle, Loader2, SkipForward, MessageSquare, FileSearch, Clock, Ban, XCircle } from 'lucide-react'
import { PulseIndicator } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { tasksApi, getEventBus } from '@/services'
import type { DependencyGraph, DependencyGraphStep, TaskStatus, StepStatus, CrudEvent } from '@/types'
import '@xyflow/react/dist/style.css'

// ============================================================================
// TYPES
// ============================================================================

export interface DependencyGraphViewProps {
  graph: DependencyGraph
  /** Fresh task statuses to override graph node statuses (e.g. from optimistic updates) */
  taskStatuses?: Map<string, TaskStatus>
  /** Callback when a node is clicked (opens task drawer) */
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
  affectedFiles?: string[]
  noteCount?: number
  decisionCount?: number
  /** Individual step details from backend */
  steps?: DependencyGraphStep[]
  /** Chat sessions linked to this task */
  sessionCount?: number
  activeSessionCount?: number
  childSessionCount?: number
  /** Files discussed in linked sessions */
  discussedFiles?: Array<{ file_path: string; mention_count: number }>
  /** Files that conflict with other tasks */
  conflictFiles?: string[]
  hasConflicts?: boolean
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
// STEP STATUS HELPERS
// ============================================================================

/** Normalize backend step status string (PascalCase) to our display format */
function normalizeStepStatus(status: string): string {
  const s = status.toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'inprogress' || s === 'in_progress') return 'in_progress'
  if (s === 'skipped') return 'skipped'
  return 'pending'
}

function StepIcon({ status }: { status: string }) {
  const normalized = normalizeStepStatus(status)
  switch (normalized) {
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
    case 'in_progress':
      return <Loader2 className="w-3 h-3 text-indigo-400 flex-shrink-0 animate-spin" />
    case 'skipped':
      return <SkipForward className="w-3 h-3 text-yellow-400 flex-shrink-0" />
    default:
      return <Circle className="w-3 h-3 text-gray-600 flex-shrink-0" />
  }
}

// ── Task status icon (replaces the 7px dot with a meaningful icon) ───────────

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColors.completed.dot }} />
    case 'in_progress':
      return <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" style={{ color: statusColors.in_progress.dot }} />
    case 'blocked':
      return <Ban className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColors.blocked.dot }} />
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColors.failed.dot }} />
    default: // pending
      return <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColors.pending.dot }} />
  }
}

// ============================================================================
// DAGRE LAYOUT (dynamic node height based on step count)
// ============================================================================

const NODE_WIDTH = 300
const BASE_NODE_HEIGHT = 80  // without steps
const STEP_ROW_HEIGHT = 18   // each step row
const MAX_VISIBLE_STEPS = 6  // cap to prevent huge nodes

const MAX_VISIBLE_FILES = 4
const FILE_ROW_HEIGHT = 14

function computeNodeHeight(stepCount: number, sessionCount = 0, discussedFileCount = 0): number {
  const visibleSteps = Math.min(stepCount, MAX_VISIBLE_STEPS)
  let height = BASE_NODE_HEIGHT
  // Steps section
  if (visibleSteps > 0) {
    height += 8 + visibleSteps * STEP_ROW_HEIGHT + (stepCount > MAX_VISIBLE_STEPS ? 14 : 0)
  }
  // Sessions row (if any)
  if (sessionCount > 0) {
    height += 16
  }
  // Discussed files section (only when few steps)
  if (discussedFileCount > 0 && stepCount <= 3) {
    const visibleFiles = Math.min(discussedFileCount, MAX_VISIBLE_FILES)
    height += 4 + visibleFiles * FILE_ROW_HEIGHT + (discussedFileCount > MAX_VISIBLE_FILES ? 12 : 0)
  }
  return height
}

function getLayoutedElements(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 })

  nodes.forEach((node) => {
    const stepCount = node.data.steps?.length ?? node.data.stepCount ?? 0
    const sessionCount = node.data.sessionCount ?? 0
    const discussedFileCount = node.data.discussedFiles?.length ?? 0
    g.setNode(node.id, { width: NODE_WIDTH, height: computeNodeHeight(stepCount, sessionCount, discussedFileCount) })
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
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ============================================================================
// ENRICHED TASK NODE (with inline step list)
// ============================================================================

function TaskNodeComponent({ data }: NodeProps<Node<TaskNodeData>>) {
  const colors = statusColors[data.status] || statusColors.pending
  const isInProgress = data.status === 'in_progress'

  const noteCount = data.noteCount ?? 0
  const decisionCount = data.decisionCount ?? 0
  const files = data.affectedFiles ?? []
  const hasConflicts = data.hasConflicts ?? false
  const conflictFiles = data.conflictFiles ?? []
  const steps = data.steps ?? []
  const sessionCount = data.sessionCount ?? 0
  const activeSessionCount = data.activeSessionCount ?? 0
  const childSessionCount = data.childSessionCount ?? 0
  const discussedFiles = data.discussedFiles ?? []

  const handleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      data.onSelect?.(data.taskId)
    },
    [data],
  )

  return (
    <div className="relative">
      <div
        onClick={handleClick}
        className={`cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:shadow-lg ${isInProgress ? 'dep-node-pulse' : ''}`}
        style={{
          background: colors.bg,
          border: `1.5px solid ${colors.border}`,
          borderRadius: 10,
          padding: '8px 10px',
          width: NODE_WIDTH,
          boxShadow: hasConflicts ? '0 0 0 1px rgba(249,115,22,0.4)' : undefined,
        }}
      >
        <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 8, height: 8 }} />

        {/* Row 1: Status icon + label + agent indicator + priority + conflict */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className={isInProgress ? 'pulse-indicator relative inline-flex shrink-0' : 'inline-flex shrink-0'}>
            {isInProgress && (
              <span
                className="pulse-ring absolute inset-[-3px] rounded-full opacity-40"
                style={{ background: colors.dot }}
              />
            )}
            <TaskStatusIcon status={data.status} />
          </div>
          <span className="text-[10px] font-medium" style={{ color: colors.text }}>
            {statusLabels[data.status]}
          </span>

          {isInProgress && data.assignedTo && (
            <span className="inline-flex items-center gap-0.5 ml-0.5">
              <PulseIndicator variant="active" size={5} />
              <span className="text-[9px] text-green-400 truncate max-w-[60px]">{data.assignedTo}</span>
            </span>
          )}

          {isInProgress && !data.assignedTo && (
            <span className="inline-flex items-center gap-0.5 ml-0.5">
              <PulseIndicator variant="active" size={5} />
              <span className="text-[9px] text-green-400">Working...</span>
            </span>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {/* Knowledge indicators inline with status row */}
            {noteCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400/70" title={`${noteCount} note${noteCount > 1 ? 's' : ''}`}>
                <StickyNote className="w-2.5 h-2.5" />
                {noteCount}
              </span>
            )}
            {decisionCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-purple-400/70" title={`${decisionCount} decision${decisionCount > 1 ? 's' : ''}`}>
                <BookOpen className="w-2.5 h-2.5" />
                {decisionCount}
              </span>
            )}
            {sessionCount > 0 && (
              <span className={`inline-flex items-center gap-0.5 text-[9px] ${activeSessionCount > 0 ? 'text-green-400' : 'text-cyan-400/70'}`}
                title={`${sessionCount} session${sessionCount > 1 ? 's' : ''}${childSessionCount > 0 ? ` · ${childSessionCount} sub` : ''}${activeSessionCount > 0 ? ' · active' : ''}`}
              >
                {activeSessionCount > 0 && <PulseIndicator variant="active" size={4} />}
                <MessageSquare className="w-2.5 h-2.5" />
                {sessionCount}
                {childSessionCount > 0 && <span className="text-[8px] text-gray-500">+{childSessionCount}</span>}
              </span>
            )}

            {data.priority != null && data.priority > 0 && (
              <span className="text-[9px] text-gray-500">P{data.priority}</span>
            )}

            {hasConflicts && (
              <span title={`Conflict on: ${conflictFiles.join(', ')}`}>
                <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Title */}
        <p
          className="text-[11px] font-medium truncate mb-1"
          style={{ color: '#e5e7eb' }}
          title={data.label}
        >
          {data.label}
        </p>

        {/* Row 3: Step list (inline, compact) */}
        {steps.length > 0 && (
          <div className="mt-1 space-y-[2px]">
            {steps.slice(0, MAX_VISIBLE_STEPS).map((step) => {
              const normalized = normalizeStepStatus(step.status)
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-1.5 py-[1px] px-1 rounded text-[9px] ${
                    normalized === 'in_progress' ? 'bg-indigo-500/10' :
                    normalized === 'completed' ? 'bg-green-500/5' :
                    'bg-transparent'
                  }`}
                >
                  <StepIcon status={step.status} />
                  <span className={`truncate flex-1 ${
                    normalized === 'completed' ? 'text-gray-500 line-through' :
                    normalized === 'in_progress' ? 'text-indigo-300' :
                    'text-gray-400'
                  }`}>
                    {step.description}
                  </span>
                </div>
              )
            })}
            {steps.length > MAX_VISIBLE_STEPS && (
              <span className="text-[8px] text-gray-600 pl-1">
                +{steps.length - MAX_VISIBLE_STEPS} more
              </span>
            )}
          </div>
        )}

        {/* Row 4: Discussed files (from chat sessions, only when few steps) */}
        {discussedFiles.length > 0 && steps.length <= 3 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {discussedFiles.slice(0, MAX_VISIBLE_FILES).map((f) => (
              <span
                key={f.file_path}
                className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400/80"
                title={`${f.file_path} (${f.mention_count}×)`}
              >
                <FileSearch className="w-2 h-2" />
                {f.file_path.split('/').pop()}
              </span>
            ))}
            {discussedFiles.length > MAX_VISIBLE_FILES && (
              <span className="text-[8px] text-gray-600 px-0.5">
                +{discussedFiles.length - MAX_VISIBLE_FILES}
              </span>
            )}
          </div>
        )}

        {/* Row 5: Affected files (compact, only if no steps or few steps) */}
        {files.length > 0 && steps.length <= 3 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {files.slice(0, 3).map((file) => (
              <span
                key={file}
                className={`
                  inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded
                  ${hasConflicts && conflictFiles.includes(file)
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'bg-white/[0.06] text-gray-500'}
                `}
                title={file}
              >
                <FileCode2 className="w-2 h-2" />
                {file.split('/').pop()}
              </span>
            ))}
            {files.length > 3 && (
              <span className="text-[8px] text-gray-600 px-0.5">
                +{files.length - 3}
              </span>
            )}
          </div>
        )}

        <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 8, height: 8 }} />
      </div>
    </div>
  )
}

const nodeTypes = { taskNode: TaskNodeComponent }

// ============================================================================
// TASK DRAWER (right panel on node click)
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
  verification?: string
  status: StepStatus
}

export function TaskDrawer({ taskId, onClose, onOpenFullPage }: TaskDrawerProps) {
  const wsSlug = useWorkspaceSlug()
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
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: newStatus } : s)))
    try {
      await tasksApi.updateStep(step.id, { status: newStatus })
    } catch {
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
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${step.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                          {step.description}
                        </span>
                        {step.verification && (
                          <p className="text-[10px] text-gray-500 mt-0.5">AC: {step.verification}</p>
                        )}
                      </div>
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

            {/* Open full page link */}
            <Link
              to={workspacePath(wsSlug, `/tasks/${task.id}`)}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open task page
            </Link>
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
  // Live step updates from CrudEvents (real-time step status changes)
  const [liveStepUpdates, setLiveStepUpdates] = useState<Map<string, { stepId: string; status: string }>>(new Map())
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
        const taskId = event.payload?.task_id as string | undefined
        const newStatus = event.payload?.status as string | undefined

        // Update individual step status
        if (newStatus && taskId) {
          setLiveStepUpdates((prev) => {
            const next = new Map(prev)
            next.set(event.entity_id, { stepId: event.entity_id, status: newStatus })
            return next
          })
        }

        // Update progress counters
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

  // Build conflict lookup from graph.conflicts
  const conflictLookup = useMemo(() => {
    const lookup = new Map<string, Set<string>>()
    for (const conflict of (graph.conflicts ?? [])) {
      for (const file of conflict.shared_files) {
        if (!lookup.has(conflict.task_a)) lookup.set(conflict.task_a, new Set())
        if (!lookup.has(conflict.task_b)) lookup.set(conflict.task_b, new Set())
        lookup.get(conflict.task_a)!.add(file)
        lookup.get(conflict.task_b)!.add(file)
      }
    }
    return lookup
  }, [graph.conflicts])

  const { layoutedNodes, layoutedEdges, graphHeight } = useMemo(() => {
    // Resolve node status: prefer liveStatuses > taskStatuses > graph data
    const resolveStatus = (nodeId: string, graphStatus: TaskStatus): TaskStatus =>
      liveStatuses.get(nodeId) ?? taskStatuses?.get(nodeId) ?? graphStatus

    const rfNodes: Node<TaskNodeData>[] = (graph.nodes || []).map((node) => {
      const liveProgress = liveStepProgress.get(node.id)
      const nodeConflictFiles = conflictLookup.get(node.id)
      const conflictFilesArr = nodeConflictFiles ? Array.from(nodeConflictFiles) : []

      // Merge live step status updates into the steps array
      const baseSteps = node.steps ?? []
      const mergedSteps = baseSteps.map((step) => {
        const liveUpdate = liveStepUpdates.get(step.id)
        if (liveUpdate) {
          return { ...step, status: liveUpdate.status }
        }
        return step
      })

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
          stepCount: liveProgress?.stepCount ?? node.step_count ?? node.stepCount ?? 0,
          completedStepCount: liveProgress?.completedStepCount ?? node.completed_step_count ?? node.completedStepCount ?? 0,
          assignedTo: node.assigned_to ?? node.assignedTo,
          affectedFiles: node.affected_files,
          noteCount: node.note_count ?? 0,
          decisionCount: node.decision_count ?? 0,
          steps: mergedSteps,
          sessionCount: node.session_count ?? 0,
          activeSessionCount: node.active_session_count ?? 0,
          childSessionCount: node.child_session_count ?? 0,
          discussedFiles: node.discussed_files ?? [],
          hasConflicts: conflictFilesArr.length > 0,
          conflictFiles: conflictFilesArr,
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

    // Calculate graph height from max node bottom position
    let maxBottom = 0
    for (const n of ln) {
      const stepCount = n.data.steps?.length ?? n.data.stepCount ?? 0
      const nodeH = computeNodeHeight(stepCount)
      const bottom = n.position.y + nodeH
      if (bottom > maxBottom) maxBottom = bottom
    }
    const calculatedHeight = Math.max(400, Math.min(1200, maxBottom + 80))

    return { layoutedNodes: ln, layoutedEdges: le, graphHeight: calculatedHeight }
  }, [graph, taskStatuses, liveStatuses, liveStepUpdates, liveStepProgress, conflictLookup, onNodeSelect])

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
        minZoom={0.2}
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
