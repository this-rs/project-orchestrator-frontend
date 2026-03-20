import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Layers, ArrowRight, FileCode2, Zap, ChevronDown, ExternalLink, Play, Eye, Clock, Loader2, Ban, CheckCircle2, XCircle } from 'lucide-react'
import { Badge, PulseIndicator } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { tasksApi, getEventBus } from '@/services'
import type { WaveComputationResult, WaveTask, FileConflict, TaskStatus, Step, StepStatus, CrudEvent, PlanStatus } from '@/types'

// ============================================================================
// TYPES
// ============================================================================

interface WaveViewProps {
  data: WaveComputationResult
  /** Fresh task statuses to override wave data (e.g. from optimistic updates) */
  taskStatuses?: Map<string, TaskStatus>
  /** Plan ID for runner link */
  planId?: string
  /** Plan status for launch button */
  planStatus?: PlanStatus
  /** Active run ID for runner link */
  runId?: string
  /** Callback to launch the plan (opens ImplementDialog with budget) */
  onLaunch?: () => void
  /** Whether a pipeline is currently running (disables launch) */
  isRunning?: boolean
  className?: string
}

// ============================================================================
// STATUS COLORS (matching design system — same as DependencyGraphView)
// ============================================================================

const statusColors: Record<TaskStatus, { bg: string; border: string; text: string; dot: string }> = {
  pending: { bg: 'bg-gray-800/60', border: 'border-gray-600', text: 'text-gray-300', dot: 'bg-gray-400' },
  in_progress: { bg: 'bg-indigo-950/60', border: 'border-indigo-500', text: 'text-indigo-300', dot: 'bg-indigo-400' },
  blocked: { bg: 'bg-amber-950/60', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-400' },
  completed: { bg: 'bg-green-950/60', border: 'border-green-500', text: 'text-green-300', dot: 'bg-green-400' },
  failed: { bg: 'bg-red-950/60', border: 'border-red-500', text: 'text-red-300', dot: 'bg-red-400' },
}

const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
}

const stepStatusIcons: Record<StepStatus, string> = {
  completed: '\u2705',
  in_progress: '\uD83D\uDD04',
  pending: '\u2B1C',
  skipped: '\u23ED',
}

const stepStatusLabels: Record<StepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  skipped: 'Skipped',
}

// ── Task status icon (matching DependencyGraphView) ─────────────────────────

const statusIconColors: Record<TaskStatus, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-indigo-400',
  blocked: 'text-amber-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

function WaveTaskStatusIcon({ status }: { status: TaskStatus }) {
  const color = statusIconColors[status] || statusIconColors.pending
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
    case 'in_progress':
      return <Loader2 className={`w-3.5 h-3.5 flex-shrink-0 animate-spin ${color}`} />
    case 'blocked':
      return <Ban className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
    case 'failed':
      return <XCircle className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
    default:
      return <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
  }
}

// ============================================================================
// SUMMARY BAR
// ============================================================================

function WaveSummaryBar({
  data,
  planId,
  planStatus,
  runId,
  onLaunch,
  isRunning,
}: {
  data: WaveComputationResult
  planId?: string
  planStatus?: PlanStatus
  runId?: string
  onLaunch?: () => void
  isRunning?: boolean
}) {
  const wsSlug = useWorkspaceSlug()
  const { summary } = data

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/[0.04] rounded-lg border border-white/[0.06] mb-4">
      <div className="flex items-center gap-1.5 text-sm">
        <Layers className="w-4 h-4 text-indigo-400" />
        <span className="text-gray-400">Waves:</span>
        <span className="font-medium text-gray-200">{summary.total_waves}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <Zap className="w-4 h-4 text-yellow-400" />
        <span className="text-gray-400">Max parallel:</span>
        <span className="font-medium text-gray-200">{summary.max_parallel}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <ArrowRight className="w-4 h-4 text-purple-400" />
        <span className="text-gray-400">Critical path:</span>
        <span className="font-medium text-gray-200">{summary.critical_path_length}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-400">Tasks:</span>
        <span className="font-medium text-gray-200">{summary.total_tasks}</span>
      </div>
      {summary.conflicts_detected > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-1.5 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-orange-400 font-medium">{summary.conflicts_detected} conflicts</span>
          </div>
        </>
      )}

      {/* Runner actions */}
      {planId && (
        <div className="ml-auto flex items-center gap-2">
          {runId && (
            <Link
              to={workspacePath(wsSlug, `/plans/${planId}/runner`)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              View Runner
            </Link>
          )}
          {!isRunning && (planStatus === 'approved' || planStatus === 'in_progress') && onLaunch && (
            <button
              onClick={onLaunch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {planStatus === 'in_progress' ? 'Resume Plan' : 'Launch Plan'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Separator() {
  return <div className="w-px h-4 bg-white/[0.1]" />
}

// ============================================================================
// TASK CARD (enriched with steps + agent indicator + expandable)
// ============================================================================

function WaveTaskCard({
  task,
  resolvedStatus,
  conflicts,
  stepsData,
  justCompleted,
}: {
  task: WaveTask
  resolvedStatus: TaskStatus
  conflicts: FileConflict[]
  stepsData: Map<string, Step[]>
  justCompleted: Set<string>
}) {
  const wsSlug = useWorkspaceSlug()
  const colors = statusColors[resolvedStatus] || statusColors.pending
  const [expanded, setExpanded] = useState(false)
  const [loadingSteps, setLoadingSteps] = useState(false)

  // Find conflicts involving this task
  const taskConflicts = conflicts.filter(
    (c) => c.task_a === task.id || c.task_b === task.id,
  )
  const hasConflicts = taskConflicts.length > 0

  // Collect all shared files for tooltip
  const conflictFiles = useMemo(() => {
    const files = new Set<string>()
    taskConflicts.forEach((c) => c.shared_files.forEach((f) => files.add(f)))
    return Array.from(files)
  }, [taskConflicts])

  // Steps info
  const steps = stepsData.get(task.id)
  const completedSteps = steps?.filter((s) => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!expanded && !steps) {
      setLoadingSteps(true)
      try {
        const fetchedSteps = await tasksApi.listSteps(task.id)
        stepsData.set(task.id, Array.isArray(fetchedSteps) ? fetchedSteps : [])
      } catch {
        stepsData.set(task.id, [])
      } finally {
        setLoadingSteps(false)
      }
    }
    setExpanded(!expanded)
  }

  const isCompleteFlash = justCompleted.has(task.id)

  return (
    <div
      className={`
        rounded-lg border transition-all duration-150
        ${colors.bg} ${colors.border}
        ${hasConflicts ? 'ring-1 ring-orange-500/40' : ''}
        ${isCompleteFlash ? 'wave-task-complete-flash' : ''}
      `}
    >
      {/* Clickable header */}
      <button
        onClick={handleClick}
        className="w-full text-left p-3 cursor-pointer"
      >
        {/* Status + Priority + Agent indicator */}
        <div className="flex items-center gap-2 mb-1.5">
          <WaveTaskStatusIcon status={resolvedStatus} />
          <span className={`text-xs font-medium ${colors.text}`}>
            {statusLabels[resolvedStatus]}
          </span>

          {/* Agent active indicator */}
          {resolvedStatus === 'in_progress' && (
            <span className="inline-flex items-center gap-1 ml-1">
              <PulseIndicator variant="active" size={6} />
              <span className="text-[10px] text-green-400">Working...</span>
            </span>
          )}

          {task.priority != null && task.priority > 0 && (
            <span className="text-[10px] text-gray-500 ml-auto">P{task.priority}</span>
          )}
          {hasConflicts && (
            <span title={`Conflict on: ${conflictFiles.join(', ')}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 ml-auto flex-shrink-0" />
            </span>
          )}

          {/* Expand chevron */}
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-500 ml-auto flex-shrink-0 transition-transform duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-gray-200 truncate" title={task.title || task.id}>
          {task.title || task.id.slice(0, 8)}
        </p>

        {/* Mini step progress bar */}
        {totalSteps > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500/70 transition-all duration-300"
                style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 flex-shrink-0">
              {completedSteps}/{totalSteps}
            </span>
          </div>
        )}

        {/* Affected files */}
        {task.affected_files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.affected_files.slice(0, 3).map((file) => (
              <span
                key={file}
                className={`
                  inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded
                  ${hasConflicts && conflictFiles.includes(file)
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'bg-white/[0.06] text-gray-500'}
                `}
                title={file}
              >
                <FileCode2 className="w-2.5 h-2.5" />
                {file.split('/').pop()}
              </span>
            ))}
            {task.affected_files.length > 3 && (
              <span className="text-[10px] text-gray-600 px-1">
                +{task.affected_files.length - 3}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded inline details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.06] pt-2 space-y-1.5">
          {loadingSteps ? (
            <div className="text-xs text-gray-500 py-2">Loading steps...</div>
          ) : steps && steps.length > 0 ? (
            steps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 py-1 px-1.5 rounded bg-white/[0.03]">
                <span className="flex-shrink-0 text-xs mt-0.5" title={stepStatusLabels[step.status]}>
                  {stepStatusIcons[step.status]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300">{step.description}</p>
                  {step.verification && (
                    <p className="text-[10px] text-gray-500 mt-0.5">AC: {step.verification}</p>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  step.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  step.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                  step.status === 'skipped' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-white/[0.08] text-gray-500'
                }`}>
                  {stepStatusLabels[step.status]}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No steps</div>
          )}

          {/* Open task page link */}
          <Link
            to={workspacePath(wsSlug, `/tasks/${task.id}`)}
            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2"
          >
            <ExternalLink className="w-3 h-3" />
            Open task page
          </Link>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// WAVE COLUMN
// ============================================================================

function WaveColumn({
  waveNumber,
  tasks,
  taskCount,
  splitFromConflicts,
  conflicts,
  taskStatuses,
  stepsData,
  justCompleted,
  isActiveWave,
}: {
  waveNumber: number
  tasks: WaveTask[]
  taskCount: number
  splitFromConflicts: boolean
  conflicts: FileConflict[]
  taskStatuses?: Map<string, TaskStatus>
  stepsData: Map<string, Step[]>
  justCompleted: Set<string>
  isActiveWave: boolean
}) {
  // Count completed tasks in this wave
  const completedCount = tasks.filter((t) => {
    const status = taskStatuses?.get(t.id) ?? t.status
    return status === 'completed'
  }).length

  return (
    <div className="flex-shrink-0 w-64 space-y-2">
      {/* Wave header */}
      <div className={`flex items-center justify-between px-2 py-1.5 rounded-md transition-all ${
        isActiveWave ? 'wave-active-glow' : ''
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-300">
            Wave {waveNumber}
          </span>
          {isActiveWave && (
            <PulseIndicator variant="active" size={6} />
          )}
          {splitFromConflicts && (
            <Badge variant="warning" className="text-[9px]">split</Badge>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {completedCount}/{taskCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 mx-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500/70 transition-all duration-300"
          style={{ width: taskCount > 0 ? `${(completedCount / taskCount) * 100}%` : '0%' }}
        />
      </div>

      {/* Task cards */}
      <div className="space-y-2 px-1">
        {tasks.map((task) => (
          <WaveTaskCard
            key={task.id}
            task={task}
            resolvedStatus={taskStatuses?.get(task.id) ?? task.status}
            conflicts={conflicts}
            stepsData={stepsData}
            justCompleted={justCompleted}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WaveView({ data, taskStatuses, planId, planStatus, runId, onLaunch, isRunning, className = '' }: WaveViewProps) {
  // Shared mutable steps cache (survives re-renders, updated by cards & events)
  const stepsDataRef = useRef(new Map<string, Step[]>())
  // Track tasks that just completed for flash animation
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  // Force re-render counter for event-driven updates
  const [, setRenderTick] = useState(0)

  // CrudEvent real-time listener
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type === 'task' && event.action === 'updated') {
        const newStatus = event.payload?.status as TaskStatus | undefined
        if (newStatus === 'completed') {
          // Flash animation for completed task
          setJustCompleted((prev) => {
            const next = new Set(prev)
            next.add(event.entity_id)
            return next
          })
          // Remove flash after animation completes
          setTimeout(() => {
            setJustCompleted((prev) => {
              const next = new Set(prev)
              next.delete(event.entity_id)
              return next
            })
          }, 1200)
        }
        // Trigger re-render so WaveColumn picks up the new taskStatuses from parent
        setRenderTick((t) => t + 1)
      }

      if (event.entity_type === 'step' && (event.action === 'updated' || event.action === 'created')) {
        // Re-fetch steps for the task that owns this step
        const taskId = event.payload?.task_id as string | undefined
        if (taskId && stepsDataRef.current.has(taskId)) {
          tasksApi.listSteps(taskId).then((fetched) => {
            stepsDataRef.current.set(taskId, Array.isArray(fetched) ? fetched : [])
            setRenderTick((t) => t + 1)
          }).catch(() => { /* ignore */ })
        }
      }
    })

    return () => { off() }
  }, [])

  // Determine active wave: first wave with any in_progress task
  const activeWaveNumber = useMemo(() => {
    for (const wave of data.waves) {
      const hasInProgress = wave.tasks.some((t) => {
        const status = taskStatuses?.get(t.id) ?? t.status
        return status === 'in_progress'
      })
      if (hasInProgress) return wave.wave_number
    }
    return -1
  }, [data.waves, taskStatuses])

  // Prefetch steps for in_progress tasks on mount
  const prefetchDone = useRef(false)
  useEffect(() => {
    if (prefetchDone.current) return
    prefetchDone.current = true

    const inProgressTasks = data.waves.flatMap((w) =>
      w.tasks.filter((t) => {
        const status = taskStatuses?.get(t.id) ?? t.status
        return status === 'in_progress'
      })
    )

    for (const task of inProgressTasks) {
      if (!stepsDataRef.current.has(task.id)) {
        tasksApi.listSteps(task.id).then((fetched) => {
          stepsDataRef.current.set(task.id, Array.isArray(fetched) ? fetched : [])
          setRenderTick((t) => t + 1)
        }).catch(() => { /* ignore */ })
      }
    }
  }, [data.waves, taskStatuses])

  if (data.waves.length === 0) {
    return <p className="text-gray-500 text-sm">No waves computed</p>
  }

  return (
    <div className={className}>
      {/* CSS animations for flash & glow */}
      <style>{`
        @keyframes wave-complete-flash {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 12px 4px rgba(34, 197, 94, 0.3); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .wave-task-complete-flash {
          animation: wave-complete-flash 1.2s ease-out;
        }
        @keyframes wave-glow {
          0%, 100% { box-shadow: 0 0 4px 0 rgba(99, 102, 241, 0.2); }
          50% { box-shadow: 0 0 12px 2px rgba(99, 102, 241, 0.3); }
        }
        .wave-active-glow {
          animation: wave-glow 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .wave-task-complete-flash,
          .wave-active-glow {
            animation: none;
          }
        }
      `}</style>

      <WaveSummaryBar data={data} planId={planId} planStatus={planStatus} runId={runId} onLaunch={onLaunch} isRunning={isRunning} />

      {/* Horizontal scrollable wave columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {data.waves.map((wave, index) => (
          <div key={wave.wave_number} className="flex items-start gap-4">
            <WaveColumn
              waveNumber={wave.wave_number}
              tasks={wave.tasks}
              taskCount={wave.task_count}
              splitFromConflicts={wave.split_from_conflicts}
              conflicts={data.conflicts}
              taskStatuses={taskStatuses}
              stepsData={stepsDataRef.current}
              justCompleted={justCompleted}
              isActiveWave={wave.wave_number === activeWaveNumber}
            />
            {/* Arrow between waves */}
            {index < data.waves.length - 1 && (
              <div className="flex items-center self-center pt-8">
                <ArrowRight className="w-5 h-5 text-gray-600" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
