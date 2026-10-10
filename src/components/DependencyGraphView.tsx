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
import { ReferenceSource } from '@/refs/source'
import { AlertTriangle, FileCode2, StickyNote, BookOpen, ExternalLink, CheckCircle2, Circle, Loader2, SkipForward, MessageSquare, FileSearch, Clock, Ban, XCircle, Bot, X } from 'lucide-react'
import { PulseIndicator, StatusIcon, StatusText, TONE_CLASSES, getStatusMeta, hitArea, textLink } from '@/components/ui'
import { statusLabel } from '@/components/ui/statusMeta'
import { useT } from '@/i18n'
import { activeTranslator } from '@/i18n/active'
import { iconButton } from '@/components/ui/classes'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { tasksApi, notesApi, getEventBus } from '@/services'
import type { DependencyGraph, DependencyGraphStep, TaskStatus, StepStatus, ActiveAgentInfo, CrudEvent } from '@/types'
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
  /** Callback when a node is double-clicked (fractal drill-down). Receives the FractalNode id (e.g. "task:uuid") */
  onNodeDoubleClick?: (nodeId: string) => void
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
  /** Active agent info (from real-time tracking) */
  activeAgent?: ActiveAgentInfo | null
  onSelect?: (taskId: string) => void
  onDoubleClick?: (taskId: string) => void
}

// ============================================================================
// STATUS COLORS — the task tones (statusMeta) as raw values for React Flow
// (edge strokes, markers, handles, the 3px rail). Never a node background:
// a node is an opaque surface, colour stays at icon / hairline size (DESIGN.md § 3).
// ============================================================================

const NODE_SURFACE = 'var(--color-surface-raised)'
const NODE_BORDER = 'rgba(255, 255, 255, 0.08)'

const statusColors: Record<TaskStatus, { border: string; text: string; dot: string }> = {
  pending: { border: '#4b5563', text: '#9ca3af', dot: '#9ca3af' },
  in_progress: { border: '#6366f1', text: '#a5b4fc', dot: '#818cf8' },
  blocked: { border: '#d97706', text: '#fbbf24', dot: '#fbbf24' },
  completed: { border: '#22c55e', text: '#34d399', dot: '#34d399' },
  failed: { border: '#ef4444', text: '#f87171', dot: '#f87171' },
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
// DURATION FORMATTER
// ============================================================================

function formatDuration(secs: number): string {
  const { t } = activeTranslator()
  if (secs < 60) return t('ui.time.seconds', { n: Math.round(secs) })
  if (secs < 3600) return t('ui.time.minutesSeconds', { m: Math.floor(secs / 60), s: Math.round(secs % 60) })
  return t('ui.time.hoursMinutes', { h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60) })
}

// ============================================================================
// RICH TOOLTIP
// ============================================================================

function TaskTooltip({ data }: { data: TaskNodeData }) {
  const { t } = useT()
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
          border: `1px solid ${NODE_BORDER}`,
          borderLeft: `3px solid ${colors.border}`,
        }}
      >
        {/* Status + Priority row — dot + word in the tone, no pill */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: colors.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} aria-hidden="true" />
            {statusLabel(data.status)}
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
            <span>{t('shell.depGraph.agentActive')}</span>
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
          <div className="flex items-center gap-1 text-gray-400 tabular-nums">
            <span>{t('shell.depGraph.steps', { done: completedStepCount, total: stepCount })}</span>
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

        {/* Affected files */}
        {data.affectedFiles && data.affectedFiles.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-gray-500 text-[10px] font-medium">{t('shell.depGraph.files', { count: data.affectedFiles.length })}</div>
            <div className="flex flex-wrap gap-1">
              {data.affectedFiles.slice(0, 4).map((f) => (
                <span key={f} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-gray-400" title={f}>
                  <FileCode2 className="w-2 h-2" />
                  {f.split('/').pop()}
                </span>
              ))}
              {data.affectedFiles.length > 4 && (
                <span className="text-[9px] text-gray-600">+{data.affectedFiles.length - 4}</span>
              )}
            </div>
          </div>
        )}

        {/* Assigned to */}
        {data.assignedTo && (
          <div className="text-gray-500 text-[10px]">
            {t('shell.depGraph.assignedTo')} <span className="text-gray-300">{data.assignedTo}</span>
          </div>
        )}
      </div>
      {/* Tooltip arrow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
        style={{ background: '#1a1a2e', borderRight: `1px solid ${NODE_BORDER}`, borderBottom: `1px solid ${NODE_BORDER}`, bottom: -4 }}
      />
    </div>
  )
}

// ============================================================================
// ENRICHED TASK NODE (with inline step list + tooltip on hover)
// ============================================================================

function TaskNodeComponent({ data }: NodeProps<Node<TaskNodeData>>) {
  const { t } = useT()
  const [hovered, setHovered] = useState(false)
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

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      data.onDoubleClick?.(data.taskId)
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
        onDoubleClick={handleDoubleClick}
        className="cursor-pointer transition-[transform,box-shadow] duration-(--duration-instant) pointer-fine:hover:scale-[1.02] hover:shadow-lg"
        style={{
          // Opaque surface + 3px tone rail: the status is said by the glyph + word below, the rail is redundant with it.
          background: NODE_SURFACE,
          border: `1px solid ${NODE_BORDER}`,
          borderLeft: `3px solid ${colors.border}`,
          borderRadius: 10,
          padding: '8px 10px',
          width: NODE_WIDTH,
          boxShadow: hasConflicts ? '0 0 0 1px rgba(251,191,36,0.4)' : undefined,
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
            {statusLabel(data.status)}
          </span>

          {/* Active agent indicator */}
          {data.activeAgent && (
            <span className="inline-flex items-center gap-0.5 ml-0.5">
              <Bot className="w-2.5 h-2.5 text-indigo-400" />
            </span>
          )}

          {isInProgress && (
            <span className="inline-flex items-center gap-0.5 ml-0.5 text-[9px] text-gray-500">
              <PulseIndicator variant="active" size={5} />
              <span className="truncate max-w-[60px]">{data.assignedTo ?? t('shell.depGraph.working')}</span>
            </span>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {/* Knowledge indicators inline with status row (entity hues at icon size only) */}
            {noteCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-400" title={t(noteCount === 1 ? 'shell.depGraph.note.one' : 'shell.depGraph.note.other', { n: noteCount })}>
                <StickyNote className="w-2.5 h-2.5 text-amber-400/70" aria-hidden="true" />
                {noteCount}
              </span>
            )}
            {decisionCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-400" title={t(decisionCount === 1 ? 'shell.depGraph.decision.one' : 'shell.depGraph.decision.other', { n: decisionCount })}>
                <BookOpen className="w-2.5 h-2.5 text-purple-400/70" aria-hidden="true" />
                {decisionCount}
              </span>
            )}
            {sessionCount > 0 && (
              <span className={`inline-flex items-center gap-0.5 text-[9px] ${activeSessionCount > 0 ? TONE_CLASSES.progress.text : 'text-gray-400'}`}
                title={[
                  t(sessionCount === 1 ? 'shell.depGraph.session.one' : 'shell.depGraph.session.other', { n: sessionCount }),
                  childSessionCount > 0 ? t('shell.depGraph.subSessions', { n: childSessionCount }) : null,
                  activeSessionCount > 0 ? t('shell.depGraph.active') : null,
                ].filter(Boolean).join(' · ')}
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
              <span title={t('shell.depGraph.conflictOn', { files: conflictFiles.join(', ') })}>
                <AlertTriangle className={`w-3 h-3 flex-shrink-0 ${TONE_CLASSES.warning.text}`} aria-label={t('shell.depGraph.conflict')} />
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
                <div key={step.id} className="flex items-center gap-1.5 py-[1px] px-1 rounded text-[9px]">
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
                {t('shell.depGraph.more', { count: steps.length - MAX_VISIBLE_STEPS })}
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
                className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-white/[0.06] text-gray-400"
                title={t('shell.depGraph.discussed', { path: f.file_path, count: f.mention_count })}
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
                className={`inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-white/[0.06] ${
                  hasConflicts && conflictFiles.includes(file) ? TONE_CLASSES.warning.text : 'text-gray-500'
                }`}
                title={hasConflicts && conflictFiles.includes(file) ? t('shell.depGraph.sharedFile', { file }) : file}
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

interface DrawerDecision {
  id: string
  description: string
  rationale?: string
  chosen_option?: string
  status: string
}

interface DrawerNote {
  id: string
  content: string
  note_type: string
  importance?: string
  tags?: string[]
}

export function TaskDrawer({ taskId, onClose, onOpenFullPage }: TaskDrawerProps) {
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()
  const [task, setTask] = useState<DrawerTask | null>(null)
  const [steps, setSteps] = useState<DrawerStep[]>([])
  const [decisions, setDecisions] = useState<DrawerDecision[]>([])
  const [notes, setNotes] = useState<DrawerNote[]>([])
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

        // Fetch decisions and notes in parallel (non-blocking)
        const [decisionsData, notesData] = await Promise.all([
          (details.decisions || []) as DrawerDecision[],
          notesApi.getEntityNotes('task', taskId).catch(() => ({ items: [] })),
        ])
        if (cancelled || !mountedRef.current) return
        setDecisions(Array.isArray(decisionsData) ? decisionsData : [])
        const noteItems = (notesData as { items?: DrawerNote[] }).items || (Array.isArray(notesData) ? notesData : [])
        setNotes(noteItems as DrawerNote[])
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


  return (
    <div className="fixed top-0 right-0 h-full w-96 max-w-full z-40 flex flex-col bg-[#12121a] border-l border-white/[0.06] shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/[0.06]">
        <span className="text-sm font-medium text-gray-300 truncate">{t('shell.depGraph.taskDetails')}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenFullPage(taskId)}
            className={`${iconButton('ghost', 'size-9 md:size-8')} text-gray-500`}
            title={t('shell.depGraph.openTask')}
            aria-label={t('shell.depGraph.openTask')}
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${iconButton('ghost', 'size-9 md:size-8')} text-gray-500`}
            title={t('ui.close')}
            aria-label={t('shell.depGraph.closeDetails')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
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
              <h3 className="text-base font-semibold text-gray-100 leading-snug mb-2 break-words">
                {task.title || task.description}
              </h3>
              <StatusText kind="task" status={task.status} icon className="text-xs font-medium" />
            </div>

            {/* Description */}
            {task.title && task.description && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-1">{t('forms.field.description')}</h4>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Steps */}
            {steps.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 tabular-nums">
                  {t('shell.depGraph.stepsTitle', { done: steps.filter((s) => s.status === 'completed').length, total: steps.length })}
                </h4>
                <div className="space-y-1">
                  {steps.map((step) => {
                    const tone = getStatusMeta('step', step.status).tone
                    const done = step.status === 'completed'
                    return (
                      // A row that toggles done / not done: the tone glyph says the state, colour is never alone.
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => handleStepToggle(step)}
                        aria-pressed={done}
                        aria-label={t(done ? 'shell.depGraph.reopenStep' : 'shell.depGraph.completeStep', { step: step.description })}
                        className={`w-full min-h-9 flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60`}
                      >
                        <StatusIcon tone={tone} className={`mt-0.5 ${TONE_CLASSES[tone].text}`} />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm break-words ${done ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                            {step.description}
                          </span>
                          {step.verification && (
                            <p className="text-[11px] leading-4 text-gray-500 mt-0.5 break-words">{t('shell.depGraph.verify', { text: step.verification })}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Acceptance criteria */}
            {task.acceptance_criteria.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2">{t('shell.depGraph.criteria')}</h4>
                <ul className="space-y-1 pl-5 list-disc marker:text-gray-600">
                  {task.acceptance_criteria.map((ac, i) => (
                    <li key={i} className="text-sm text-gray-300 break-words">
                      {ac}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tags */}
            {task.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2">{t('forms.field.tags')}</h4>
                <p className="text-xs text-gray-400 break-words">{task.tags.map((tag) => `#${tag}`).join(' ')}</p>
              </div>
            )}

            {/* Affected files */}
            {task.affected_files.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 tabular-nums">
                  <FileCode2 className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />
                  {t('shell.depGraph.affectedFiles', { count: task.affected_files.length })}
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

            {/* Decisions */}
            {decisions.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 tabular-nums">
                  <BookOpen className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />
                  {t('shell.depGraph.decisions', { count: decisions.length })}
                </h4>
                <div className="space-y-2">
                  {decisions.map((d) => (
                    <ReferenceSource
                      key={d.id}
                      entity={{ kind: 'decision', id: d.id, label: d.description }}
                      button
                      className="relative rounded-lg p-2.5 bg-white/[0.03] border border-white/[0.06] space-y-1.5 min-w-0"
                    >
                      <p className="text-sm text-gray-200 leading-snug break-words">{d.description}</p>
                      {d.chosen_option && (
                        <div className="flex items-start gap-1.5 min-w-0">
                          <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${TONE_CLASSES.success.text}`} aria-label={t('shell.depGraph.chosenOption')} />
                          <span className="text-xs text-gray-300 break-words">{d.chosen_option}</span>
                        </div>
                      )}
                      {d.rationale && (
                        <p className="text-xs text-gray-500 leading-relaxed break-words">{d.rationale}</p>
                      )}
                      <StatusText kind="decision" status={d.status} icon className="text-[11px]" />
                    </ReferenceSource>
                  ))}
                </div>
              </div>
            )}

            {/* Notes / Knowledge */}
            {notes.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 tabular-nums">
                  <StickyNote className="w-3 h-3 inline mr-1 -mt-0.5" aria-hidden="true" />
                  {t('shell.depGraph.notes', { count: notes.length })}
                </h4>
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-lg p-2.5 bg-white/[0.03] border border-white/[0.06] space-y-1.5 min-w-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        {/* The note type is a label: a subtle outline chip, never a coloured fill (DESIGN.md § 4) */}
                        <span className="rounded border border-white/[0.08] px-1.5 text-gray-400">{n.note_type}</span>
                        {n.importance && <StatusText kind="importance" status={n.importance} icon />}
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-4 break-words">{n.content}</p>
                      {n.tags && n.tags.length > 0 && (
                        <p className="text-[11px] leading-4 text-gray-500 break-words">{n.tags.slice(0, 4).map((tag) => `#${tag}`).join(' ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open full page link */}
            <ReferenceSource entity={{ kind: 'task', id: task.id, label: task.title || task.description }} button className="flex items-center gap-2">
            <Link
              to={workspacePath(wsSlug, `/tasks/${task.id}`)}
              className={`${textLink} ${hitArea} inline-flex items-center gap-1 text-xs`}
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              {t('shell.depGraph.openTask')}
            </Link>
            </ReferenceSource>
          </>
        ) : (
          <p className="text-sm text-gray-500">{t('shell.depGraph.loadFailed')}</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DependencyGraphView({ graph, taskStatuses, onNodeSelect, onNodeDoubleClick, className = '' }: DependencyGraphViewProps) {
  const { t } = useT()
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
          affectedFiles: node.affected_files ?? node.affectedFiles,
          noteCount: node.note_count ?? 0,
          decisionCount: node.decision_count ?? 0,
          steps: mergedSteps,
          sessionCount: node.session_count ?? 0,
          activeSessionCount: node.active_session_count ?? 0,
          childSessionCount: node.child_session_count ?? 0,
          discussedFiles: node.discussed_files ?? [],
          hasConflicts: conflictFilesArr.length > 0,
          conflictFiles: conflictFilesArr,
          activeAgent: node.activeAgent,
          onSelect: onNodeSelect,
          onDoubleClick: onNodeDoubleClick,
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
  }, [graph, taskStatuses, liveStatuses, liveStepUpdates, liveStepProgress, conflictLookup, onNodeSelect, onNodeDoubleClick])

  if (layoutedNodes.length === 0) {
    return <p className="text-gray-500 text-sm">{t('shell.depGraph.empty')}</p>
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
