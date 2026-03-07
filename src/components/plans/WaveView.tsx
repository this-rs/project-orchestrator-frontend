import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Layers, ArrowRight, FileCode2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { WaveComputationResult, WaveTask, FileConflict, TaskStatus } from '@/types'

// ============================================================================
// TYPES
// ============================================================================

interface WaveViewProps {
  data: WaveComputationResult
  /** Fresh task statuses to override wave data (e.g. from optimistic updates) */
  taskStatuses?: Map<string, TaskStatus>
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

// ============================================================================
// SUMMARY BAR
// ============================================================================

function WaveSummaryBar({ data }: { data: WaveComputationResult }) {
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
    </div>
  )
}

function Separator() {
  return <div className="w-px h-4 bg-white/[0.1]" />
}

// ============================================================================
// TASK CARD
// ============================================================================

function WaveTaskCard({
  task,
  resolvedStatus,
  conflicts,
}: {
  task: WaveTask
  resolvedStatus: TaskStatus
  conflicts: FileConflict[]
}) {
  const wsSlug = useWorkspaceSlug()
  const colors = statusColors[resolvedStatus] || statusColors.pending

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

  return (
    <Link
      to={workspacePath(wsSlug, `/tasks/${task.id}`)}
      className={`
        block p-3 rounded-lg border transition-all duration-150
        hover:scale-[1.02] hover:shadow-lg
        ${colors.bg} ${colors.border}
        ${hasConflicts ? 'ring-1 ring-orange-500/40' : ''}
      `}
    >
      {/* Status + Priority */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-2 h-2 rounded-full ${colors.dot} flex-shrink-0`} />
        <span className={`text-xs font-medium ${colors.text}`}>
          {statusLabels[resolvedStatus]}
        </span>
        {task.priority != null && task.priority > 0 && (
          <span className="text-[10px] text-gray-500 ml-auto">P{task.priority}</span>
        )}
        {hasConflicts && (
          <span title={`Conflict on: ${conflictFiles.join(', ')}`}>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 ml-auto flex-shrink-0" />
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-200 truncate" title={task.title || task.id}>
        {task.title || task.id.slice(0, 8)}
      </p>

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
    </Link>
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
}: {
  waveNumber: number
  tasks: WaveTask[]
  taskCount: number
  splitFromConflicts: boolean
  conflicts: FileConflict[]
  taskStatuses?: Map<string, TaskStatus>
}) {
  // Count completed tasks in this wave
  const completedCount = tasks.filter((t) => {
    const status = taskStatuses?.get(t.id) ?? t.status
    return status === 'completed'
  }).length

  return (
    <div className="flex-shrink-0 w-64 space-y-2">
      {/* Wave header */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-300">
            Wave {waveNumber}
          </span>
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
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WaveView({ data, taskStatuses, className = '' }: WaveViewProps) {
  if (data.waves.length === 0) {
    return <p className="text-gray-500 text-sm">No waves computed</p>
  }

  return (
    <div className={className}>
      <WaveSummaryBar data={data} />

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
