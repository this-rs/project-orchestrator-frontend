/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { InteractivePlanStatusBadge, TaskStatusBadge } from '@/components/ui'
import { tasksApi } from '@/services'
import type { Plan, Task, Step, PlanStatus, StepStatus } from '@/types'

// ── Chevron icon ──────────────────────────────────────────────────────────────

export function ChevronIcon({
  expanded,
  className,
}: {
  expanded: boolean
  className?: string
}) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className || ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Step status constants ─────────────────────────────────────────────────────

export const stepStatusColors: Record<StepStatus, string> = {
  pending: 'bg-white/[0.15]',
  in_progress: 'bg-blue-600',
  completed: 'bg-green-600',
  skipped: 'bg-yellow-600',
}

export const stepStatusLabels: Record<StepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  skipped: 'Skipped',
}

// ── Compact Step Row (read-only) ──────────────────────────────────────────────

export function CompactStepRow({ step, index }: { step: Step; index: number }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.03]">
      <div
        className={`w-5 h-5 rounded-full ${stepStatusColors[step.status]} flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5`}
      >
        {step.status === 'completed' ? '\u2713' : index + 1}
      </div>
      <p className="text-sm text-gray-300 flex-1 min-w-0">{step.description}</p>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
          step.status === 'completed'
            ? 'bg-green-500/20 text-green-400'
            : step.status === 'in_progress'
              ? 'bg-blue-500/20 text-blue-400'
              : step.status === 'skipped'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-white/[0.08] text-gray-500'
        }`}
      >
        {stepStatusLabels[step.status]}
      </span>
    </div>
  )
}

// ── Nested Task Row (inside a plan, expandable to show steps) ─────────────────

export function NestedTaskRow({
  task,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
}: {
  task: Task
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])

  const fetchSteps = useCallback(async () => {
    try {
      const response = await tasksApi.listSteps(task.id)
      setSteps(Array.isArray(response) ? response : [])
    } catch {
      setSteps([])
    }
  }, [task.id])

  // Eager fetch on mount + WS refresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from external API
    fetchSteps()
  }, [refreshTrigger, fetchSteps])

  // Expand/Collapse all signals
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (expandAllSignal) setExpanded(true)
  }, [expandAllSignal])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (collapseAllSignal) setExpanded(false)
  }, [collapseAllSignal])

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const totalSteps = steps.length

  return (
    <div className="bg-white/[0.04] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show steps'}
        >
          <ChevronIcon expanded={expanded} className="!w-3 !h-3" />
        </button>
        <Link
          to={`/tasks/${task.id}`}
          className="flex-1 min-w-0 text-sm text-gray-300 hover:text-indigo-400 transition-colors truncate"
        >
          {task.title || task.description}
        </Link>
        {totalSteps > 0 && (
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {completedSteps}/{totalSteps}
          </span>
        )}
        <TaskStatusBadge status={task.status} />
      </div>
      {expanded && (
        <div className="pl-9 pr-2 pb-2 space-y-1">
          {steps.length > 0 ? (
            steps.map((step, index) => (
              <CompactStepRow key={step.id || index} step={step} index={index} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No steps</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expandable Plan Row (Plan -> Tasks -> Steps) ──────────────────────────────

export function ExpandablePlanRow({
  plan,
  onStatusChange,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
}: {
  plan: Plan
  onStatusChange: (newStatus: PlanStatus) => Promise<void>
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])

  const fetchTasks = useCallback(async () => {
    try {
      const data = await tasksApi.list({ plan_id: plan.id, limit: 100 })
      setTasks(data.items || [])
    } catch {
      setTasks([])
    }
  }, [plan.id])

  // Eager fetch on mount + WS refresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from external API
    fetchTasks()
  }, [refreshTrigger, fetchTasks])

  // Expand/Collapse all signals
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (expandAllSignal) setExpanded(true)
  }, [expandAllSignal])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (collapseAllSignal) setExpanded(false)
  }, [collapseAllSignal])

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(!expanded)
  }

  return (
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show tasks'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <Link
          to={`/plans/${plan.id}`}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors overflow-hidden"
        >
          <span className="font-medium text-gray-200 block truncate">{plan.title}</span>
          {plan.description && (
            <p className="text-sm text-gray-400 line-clamp-1 mt-1">{plan.description}</p>
          )}
        </Link>
        {tasks.length > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">{tasks.length} tasks</span>
        )}
        <InteractivePlanStatusBadge status={plan.status} onStatusChange={onStatusChange} />
      </div>
      {expanded && (
        <div className="pl-8 pr-3 pb-3 space-y-1.5">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <NestedTaskRow key={task.id} task={task} refreshTrigger={refreshTrigger} expandAllSignal={expandAllSignal} collapseAllSignal={collapseAllSignal} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No tasks</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expandable Task Row (top-level tasks section) ─────────────────────────────

export function ExpandableTaskRow({
  task,
  refreshTrigger,
  expandAllSignal,
  collapseAllSignal,
}: {
  task: Task
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])

  const fetchSteps = useCallback(async () => {
    try {
      const response = await tasksApi.listSteps(task.id)
      setSteps(Array.isArray(response) ? response : [])
    } catch {
      setSteps([])
    }
  }, [task.id])

  // Eager fetch on mount + WS refresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from external API
    fetchSteps()
  }, [refreshTrigger, fetchSteps])

  // Expand/Collapse all signals
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (expandAllSignal) setExpanded(true)
  }, [expandAllSignal])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (collapseAllSignal) setExpanded(false)
  }, [collapseAllSignal])

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const completedSteps = steps.filter((s) => s.status === 'completed').length
  const totalSteps = steps.length

  return (
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={toggleExpand}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show steps'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <Link
          to={`/tasks/${task.id}`}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors overflow-hidden"
        >
          <span className="font-medium text-gray-200 block truncate">{task.title || task.description}</span>
        </Link>
        {totalSteps > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {completedSteps}/{totalSteps}
          </span>
        )}
        <TaskStatusBadge status={task.status} />
      </div>
      {expanded && (
        <div className="pl-11 pr-3 pb-3 space-y-1.5">
          {steps.length > 0 ? (
            steps.map((step, index) => (
              <CompactStepRow key={step.id || index} step={step} index={index} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No steps</div>
          )}
        </div>
      )}
    </div>
  )
}
