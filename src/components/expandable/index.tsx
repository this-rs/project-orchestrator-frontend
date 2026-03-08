/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { InteractivePlanStatusBadge, TaskStatusBadge, MilestoneStatusBadge, PlanStatusBadge } from '@/components/ui'
import { tasksApi, projectsApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Plan, Task, Step, PlanStatus, StepStatus, Milestone, MilestoneProgress, MilestonePlanSummary, MilestoneTaskSummary, MilestoneStepSummary } from '@/types'

// ── Chevron icon ──────────────────────────────────────────────────────────────

export function ChevronIcon({
  expanded,
  className,
}: {
  expanded: boolean
  className?: string
}) {
  return (
    <ChevronRight
      className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className || ''}`}
    />
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
  planId,
  planTitle,
}: {
  task: Task
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
  planId?: string
  planTitle?: string
}) {
  const wsSlug = useWorkspaceSlug()
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
          to={workspacePath(wsSlug, `/tasks/${task.id}`)}
          state={planId ? { planId, planTitle } : undefined}
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
  linkState,
}: {
  plan: Plan
  onStatusChange: (newStatus: PlanStatus) => Promise<void>
  refreshTrigger?: number
  expandAllSignal?: number
  collapseAllSignal?: number
  /** Extra state to pass to the plan Link (e.g. project context) */
  linkState?: Record<string, unknown>
}) {
  const wsSlug = useWorkspaceSlug()
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
          to={workspacePath(wsSlug, `/plans/${plan.id}`)}
          state={linkState}
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
              <NestedTaskRow key={task.id} task={task} refreshTrigger={refreshTrigger} expandAllSignal={expandAllSignal} collapseAllSignal={collapseAllSignal} planId={plan.id} planTitle={plan.title} />
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
  const wsSlug = useWorkspaceSlug()
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
          to={workspacePath(wsSlug, `/tasks/${task.id}`)}
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

// ── Milestone Step Row (from enriched data) ───────────────────────────────────

function MilestoneStepRow({ step, index }: { step: MilestoneStepSummary; index: number }) {
  const status = step.status as StepStatus
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.02]">
      <div
        className={`w-5 h-5 rounded-full ${stepStatusColors[status] || stepStatusColors.pending} flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0 mt-0.5`}
      >
        {status === 'completed' ? '\u2713' : index + 1}
      </div>
      <p className="text-sm text-gray-300 flex-1 min-w-0">{step.description}</p>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
          status === 'completed'
            ? 'bg-green-500/20 text-green-400'
            : status === 'in_progress'
              ? 'bg-blue-500/20 text-blue-400'
              : status === 'skipped'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-white/[0.08] text-gray-500'
        }`}
      >
        {stepStatusLabels[status] || status}
      </span>
    </div>
  )
}

// ── Milestone Task Row (from enriched data) ───────────────────────────────────

function MilestoneTaskRow({ task, wsSlug }: { task: MilestoneTaskSummary; wsSlug: string }) {
  const [expanded, setExpanded] = useState(false)
  const completedSteps = task.steps.filter((s) => s.status === 'completed').length

  return (
    <div className="bg-white/[0.03] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        {task.steps.length > 0 ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ChevronIcon expanded={expanded} className="!w-3 !h-3" />
          </button>
        ) : (
          <div className="w-5 h-5 flex-shrink-0" />
        )}
        <Link
          to={workspacePath(wsSlug, `/tasks/${task.id}`)}
          className="flex-1 min-w-0 text-sm text-gray-300 hover:text-indigo-400 transition-colors truncate"
        >
          {task.title || task.description}
        </Link>
        {task.steps.length > 0 && (
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {completedSteps}/{task.steps.length}
          </span>
        )}
        <TaskStatusBadge status={task.status as Task['status']} />
      </div>
      {expanded && task.steps.length > 0 && (
        <div className="pl-9 pr-2 pb-2 space-y-1">
          {task.steps.map((step, i) => (
            <MilestoneStepRow key={step.id || i} step={step} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Milestone Plan Row (from enriched data) ───────────────────────────────────

function MilestonePlanRow({ plan, wsSlug }: { plan: MilestonePlanSummary; wsSlug: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white/[0.04] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        {plan.tasks.length > 0 ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ChevronIcon expanded={expanded} className="!w-3 !h-3" />
          </button>
        ) : (
          <div className="w-5 h-5 flex-shrink-0" />
        )}
        <Link
          to={workspacePath(wsSlug, `/plans/${plan.id}`)}
          className="flex-1 min-w-0 text-sm text-gray-300 hover:text-indigo-400 transition-colors truncate"
        >
          {plan.title}
        </Link>
        {plan.tasks.length > 0 && (
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {plan.tasks.length} tasks
          </span>
        )}
        {plan.status && (
          <PlanStatusBadge status={plan.status as Plan['status']} />
        )}
      </div>
      {expanded && (
        <div className="pl-7 pr-2 pb-2 space-y-1">
          {plan.tasks.length > 0 ? (
            plan.tasks.map((task) => (
              <MilestoneTaskRow key={task.id} task={task} wsSlug={wsSlug} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No tasks</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expandable Milestone Row (Milestone -> Plans -> Tasks -> Steps) ───────────

export function ExpandableMilestoneRow({
  milestone,
  progress,
  refreshTrigger,
  linkState,
}: {
  milestone: Milestone
  progress?: MilestoneProgress
  refreshTrigger?: number
  linkState?: Record<string, unknown>
}) {
  const wsSlug = useWorkspaceSlug()
  const [expanded, setExpanded] = useState(false)
  const [plans, setPlans] = useState<MilestonePlanSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchEnrichedData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await projectsApi.getMilestone(milestone.id)
      setPlans(data.plans || [])
      setLoaded(true)
    } catch (err) {
      console.error('Failed to fetch milestone details:', err)
    } finally {
      setLoading(false)
    }
  }, [milestone.id])

  // Re-fetch on external refresh when expanded
  useEffect(() => {
    if (expanded && loaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-fetch from external API on WS refresh
      fetchEnrichedData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch on refreshTrigger change
  }, [refreshTrigger])

  const handleToggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    if (newExpanded && !loaded) fetchEnrichedData()
  }

  const completedTasks = progress?.completed ?? 0
  const totalTasks = progress?.total ?? 0

  return (
    <div className="bg-white/[0.06] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={handleToggle}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Show plans & tasks'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <Link
          to={workspacePath(wsSlug, `/project-milestones/${milestone.id}`)}
          state={linkState}
          className="flex-1 min-w-0 hover:text-indigo-400 transition-colors"
        >
          <span className="font-medium text-gray-200 block truncate">{milestone.title}</span>
        </Link>
        {totalTasks > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {completedTasks}/{totalTasks}
          </span>
        )}
        {milestone.target_date && (
          <span className="text-[10px] text-gray-600 flex-shrink-0">
            {new Date(milestone.target_date).toLocaleDateString()}
          </span>
        )}
        <MilestoneStatusBadge status={milestone.status} />
      </div>
      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="px-3 pb-1">
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${progress?.percentage ?? 0}%` }}
            />
          </div>
        </div>
      )}
      {expanded && (
        <div className="pl-8 pr-3 pb-3 space-y-1.5">
          {loading ? (
            <div className="text-xs text-gray-500 py-2 animate-pulse">Loading plans...</div>
          ) : plans.length > 0 ? (
            plans.map((plan) => (
              <MilestonePlanRow key={plan.id} plan={plan} wsSlug={wsSlug} />
            ))
          ) : (
            <div className="text-xs text-gray-500 py-1">No plans linked</div>
          )}
        </div>
      )}
    </div>
  )
}
