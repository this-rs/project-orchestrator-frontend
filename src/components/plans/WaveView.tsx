import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddToChatButton, useReferenceSource } from '@/refs/source'
import { AlertTriangle, Layers, ArrowRight, FileCode2, Zap, ChevronDown, ExternalLink, Play, Eye } from 'lucide-react'
import {
  Button,
  PriorityText,
  ProgressLine,
  StatusDot,
  StatusText,
  TONE_CLASSES,
  ToneText,
  focusRingInset,
  getStatusMeta,
  hitArea,
  textLink,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { tasksApi, getEventBus } from '@/services'
import type { WaveComputationResult, WaveTask, FileConflict, TaskStatus, Step, CrudEvent, PlanStatus } from '@/types'

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

/**
 * A task card reads like a list card (DESIGN.md § 4–5): opaque surface, the
 * status as glyph + word in its tone, a 3px tone rail on tasks that move or
 * need someone — never a colour wash. Done / idle cards stay quiet.
 */
const RAIL_TONES = new Set(['progress', 'info', 'warning', 'danger', 'special'])

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
  const navigate = useNavigate()
  const { summary } = data

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-white/[0.02] rounded-xl border border-white/[0.06] mb-4">
      <div className="flex items-center gap-1.5 text-sm">
        <Layers className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <span className="text-gray-400">Waves:</span>
        <span className="font-medium text-gray-200 tabular-nums">{summary.total_waves}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <Zap className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <span className="text-gray-400">Max parallel:</span>
        <span className="font-medium text-gray-200 tabular-nums">{summary.max_parallel}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <ArrowRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <span className="text-gray-400">Critical path:</span>
        <span className="font-medium text-gray-200 tabular-nums">{summary.critical_path_length}</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-400">Tasks:</span>
        <span className="font-medium text-gray-200 tabular-nums">{summary.total_tasks}</span>
      </div>
      {summary.conflicts_detected > 0 && (
        <>
          <Separator />
          <ToneText tone="warning" icon label={`${summary.conflicts_detected} conflicts`} className="text-sm font-medium" />
        </>
      )}

      {/* Runner actions — one primary per zone, the secondary is flat */}
      {planId && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {runId && (
            <Button size="sm" variant="secondary" flat onClick={() => navigate(workspacePath(wsSlug, `/plans/${planId}/runner`))}>
              <Eye className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              View runner
            </Button>
          )}
          {!isRunning && (planStatus === 'approved' || planStatus === 'in_progress') && onLaunch && (
            <Button size="sm" onClick={onLaunch}>
              <Play className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {planStatus === 'in_progress' ? 'Resume plan' : 'Launch plan'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Separator() {
  return <div className="hidden sm:block w-px h-4 bg-white/[0.1]" aria-hidden="true" />
}

// ============================================================================
// TASK CARD (enriched with steps + agent indicator + expandable)
// ============================================================================

function WaveTaskCard({
  task,
  resolvedStatus,
  conflicts,
  steps,
  onStepsLoaded,
}: {
  task: WaveTask
  resolvedStatus: TaskStatus
  conflicts: FileConflict[]
  /** Steps already loaded for this task (shared cache held by WaveView). */
  steps?: Step[]
  onStepsLoaded: (taskId: string, steps: Step[]) => void
}) {
  const wsSlug = useWorkspaceSlug()
  const tone = getStatusMeta('task', resolvedStatus).tone
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
  const completedSteps = steps?.filter((s) => s.status === 'completed').length ?? 0
  const totalSteps = steps?.length ?? 0

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!expanded && !steps) {
      setLoadingSteps(true)
      try {
        const fetchedSteps = await tasksApi.listSteps(task.id)
        onStepsLoaded(task.id, Array.isArray(fetchedSteps) ? fetchedSteps : [])
      } catch {
        onStepsLoaded(task.id, [])
      } finally {
        setLoadingSteps(false)
      }
    }
    setExpanded(!expanded)
  }

  const title = task.title || task.id.slice(0, 8)
  const source = useReferenceSource({ kind: 'task', id: task.id, label: title })

  return (
    <div
      {...source}
      className={`relative overflow-hidden rounded-lg border border-white/[0.06] bg-surface-raised transition-colors duration-(--duration-instant) ${
        hasConflicts ? `ring-1 ${TONE_CLASSES.warning.ring}` : ''
      }`}
    >
      {RAIL_TONES.has(tone) && (
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${TONE_CLASSES[tone].dot} opacity-80`} />
      )}
      <AddToChatButton entity={{ kind: 'task', id: task.id, label: title }} className="absolute bottom-1 right-1" />

      {/* Clickable header: a disclosure, not a styled button */}
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={expanded}
        aria-label={expanded ? `Hide steps of ${title}` : `Show steps of ${title}`}
        className={`w-full text-left p-3 cursor-pointer rounded-lg ${focusRingInset}`}
      >
        {/* Status + agent + priority + conflict */}
        <div className="flex items-center gap-2 mb-1.5 min-w-0">
          <StatusText kind="task" status={resolvedStatus} icon className="text-xs font-medium" />

          {/* Agent active indicator (temporal: it stops when the task does) */}
          {resolvedStatus === 'in_progress' && (
            <span className="inline-flex items-center gap-1 ml-1 text-[11px] text-gray-500">
              <StatusDot tone="progress" pulse />
              Working…
            </span>
          )}

          <span className="ml-auto inline-flex items-center gap-1.5">
            <PriorityText priority={task.priority} className="text-[11px]" />
            {hasConflicts && (
              <span title={`Conflict on: ${conflictFiles.join(', ')}`}>
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${TONE_CLASSES.warning.text}`} aria-label="File conflict" />
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform duration-(--duration-fast) ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-gray-200 line-clamp-2 break-words" title={task.title || task.id}>
          {title}
        </p>

        {/* Mini step progress */}
        {totalSteps > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <ProgressLine value={(completedSteps / totalSteps) * 100} label={`${completedSteps} of ${totalSteps} steps done`} className="flex-1" />
            <span className="text-[11px] leading-4 text-gray-500 tabular-nums shrink-0">
              {completedSteps}/{totalSteps}
            </span>
          </div>
        )}

        {/* Affected files */}
        {task.affected_files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.affected_files.slice(0, 3).map((file) => {
              const conflicting = hasConflicts && conflictFiles.includes(file)
              return (
                <span
                  key={file}
                  className={`inline-flex items-center gap-1 text-[11px] leading-4 px-1.5 py-0.5 rounded bg-white/[0.06] ${
                    conflicting ? TONE_CLASSES.warning.text : 'text-gray-500'
                  }`}
                  title={conflicting ? `${file} — shared with another task of this wave` : file}
                >
                  <FileCode2 className="w-2.5 h-2.5" aria-hidden="true" />
                  {file.split('/').pop()}
                </span>
              )
            })}
            {task.affected_files.length > 3 && (
              <span className="text-[11px] leading-4 text-gray-600 px-1">
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
            <div className="text-xs text-gray-500 py-2">Loading steps…</div>
          ) : steps && steps.length > 0 ? (
            steps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 py-1 px-1.5 rounded bg-white/[0.03] min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 break-words">{step.description}</p>
                  {step.verification && (
                    <p className="text-[11px] leading-4 text-gray-500 mt-0.5 break-words">Verify: {step.verification}</p>
                  )}
                </div>
                <StatusText kind="step" status={step.status} icon className="shrink-0 text-[11px]" />
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No steps</div>
          )}

          {/* Open task page link */}
          <Link
            to={workspacePath(wsSlug, `/tasks/${task.id}`)}
            className={`${textLink} ${hitArea} inline-flex items-center gap-1 text-xs mt-2`}
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            Open task
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
  onStepsLoaded,
  isActiveWave,
}: {
  waveNumber: number
  tasks: WaveTask[]
  taskCount: number
  splitFromConflicts: boolean
  conflicts: FileConflict[]
  taskStatuses?: Map<string, TaskStatus>
  stepsData: Map<string, Step[]>
  onStepsLoaded: (taskId: string, steps: Step[]) => void
  isActiveWave: boolean
}) {
  // Count completed tasks in this wave
  const completedCount = tasks.filter((t) => {
    const status = taskStatuses?.get(t.id) ?? t.status
    return status === 'completed'
  }).length

  return (
    <div className="flex-shrink-0 w-64 space-y-2">
      {/* Wave header: the active wave is said by a pulsing dot + label, never a glow */}
      <div className="flex items-center justify-between px-2 py-1.5 min-h-9">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-300">
            Wave {waveNumber}
          </span>
          {isActiveWave && <StatusDot tone="progress" pulse label="Active wave" />}
          {splitFromConflicts && (
            <ToneText tone="warning" label="split" className="text-[11px]" />
          )}
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {completedCount}/{taskCount}
        </span>
      </div>

      {/* Progress bar */}
      <ProgressLine
        value={taskCount > 0 ? (completedCount / taskCount) * 100 : 0}
        label={`Wave ${waveNumber}: ${completedCount} of ${taskCount} tasks done`}
        className="mx-2 w-auto"
      />

      {/* Task cards */}
      <div className="space-y-2 px-1">
        {tasks.map((task) => (
          <WaveTaskCard
            key={task.id}
            task={task}
            resolvedStatus={taskStatuses?.get(task.id) ?? task.status}
            conflicts={conflicts}
            steps={stepsData.get(task.id)}
            onStepsLoaded={onStepsLoaded}
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
  // Shared steps cache: state (so cards re-render when it changes), mirrored in a ref for the event listener.
  const [stepsData, setStepsData] = useState<Map<string, Step[]>>(() => new Map())
  const loadedRef = useRef(stepsData)
  useEffect(() => {
    loadedRef.current = stepsData
  }, [stepsData])
  const setSteps = useCallback((taskId: string, steps: Step[]) => {
    setStepsData((prev) => new Map(prev).set(taskId, steps))
  }, [])
  // Force re-render counter for event-driven updates
  const [, setRenderTick] = useState(0)

  // CrudEvent real-time listener — data updates in place, nothing flashes (DESIGN.md « Mouvement »)
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type === 'task' && event.action === 'updated') {
        // Trigger re-render so WaveColumn picks up the new taskStatuses from parent
        setRenderTick((t) => t + 1)
      }

      if (event.entity_type === 'step' && (event.action === 'updated' || event.action === 'created')) {
        // Re-fetch steps for the task that owns this step
        const taskId = event.payload?.task_id as string | undefined
        if (taskId && loadedRef.current.has(taskId)) {
          tasksApi.listSteps(taskId).then((fetched) => {
            setSteps(taskId, Array.isArray(fetched) ? fetched : [])
          }).catch(() => { /* ignore */ })
        }
      }
    })

    return () => { off() }
  }, [setSteps])

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
      if (!loadedRef.current.has(task.id)) {
        tasksApi.listSteps(task.id).then((fetched) => {
          setSteps(task.id, Array.isArray(fetched) ? fetched : [])
        }).catch(() => { /* ignore */ })
      }
    }
  }, [data.waves, taskStatuses, setSteps])

  if (data.waves.length === 0) {
    return <p className="text-gray-500 text-sm">No waves computed</p>
  }

  return (
    <div className={className}>
      <WaveSummaryBar data={data} planId={planId} planStatus={planStatus} runId={runId} onLaunch={onLaunch} isRunning={isRunning} />

      {/* Horizontal scrollable wave columns — the strip scrolls, never the page */}
      <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-4 scrollbar-thin">
        {data.waves.map((wave, index) => (
          <div key={wave.wave_number} className="flex items-start gap-4">
            <WaveColumn
              waveNumber={wave.wave_number}
              tasks={wave.tasks}
              taskCount={wave.task_count}
              splitFromConflicts={wave.split_from_conflicts}
              conflicts={data.conflicts}
              taskStatuses={taskStatuses}
              stepsData={stepsData}
              onStepsLoaded={setSteps}
              isActiveWave={wave.wave_number === activeWaveNumber}
            />
            {/* Arrow between waves */}
            {index < data.waves.length - 1 && (
              <div className="flex items-center self-center pt-8">
                <ArrowRight className="w-5 h-5 text-gray-600" aria-hidden="true" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
