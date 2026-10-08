/* eslint-disable react-refresh/only-export-components */
/**
 * Expandable hierarchy rows (Milestone → Plan → Task → Step).
 *
 * Every level is an `EntityRow` (see components/ui/DESIGN.md): the title is the
 * link, the leading slot is a 36px disclosure button, status is dot + text in
 * the meta line, nested levels render as a flush list under the row.
 * No hover-only UI, nothing truncated on phones (titles clamp at 2 lines).
 */
import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  EntityList,
  EntityRow,
  EntityRowSkeleton,
  StatusMenu,
  StatusText,
  StatusDot,
  PriorityText,
  getStatusMeta,
  formatDay,
  pluralize,
  focusRing,
  metaText,
  ProgressLine,
} from '@/components/ui'
import { tasksApi, projectsApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type {
  Plan,
  Task,
  Step,
  PlanStatus,
  StepStatus,
  Milestone,
  MilestoneProgress,
  MilestonePlanSummary,
  MilestoneTaskSummary,
  MilestoneStepSummary,
} from '@/types'

// ── Shared bits ──────────────────────────────────────────────────────────────

export function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <ChevronRight
      className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className || ''}`}
      aria-hidden="true"
    />
  )
}

/** 36px disclosure toggle for the EntityRow leading slot (visual 16px). */
function Disclosure({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-label={label}
      className={`-m-2.5 p-2.5 rounded-md text-gray-500 hover:text-gray-200 ${focusRing}`}
    >
      <ChevronIcon expanded={expanded} />
    </button>
  )
}

/** Placeholder keeping titles aligned when a row has nothing to expand. */
function LeadingSpacer() {
  return <span className="inline-block w-4" aria-hidden="true" />
}

/** Nested list under a row (flush, hairline on the left for hierarchy). */
function NestedList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <EntityList variant="flush" aria-label={label} className="border-l border-white/[0.06]">
      {children}
    </EntityList>
  )
}

/** Nested rows drop the horizontal padding of top-level rows (compact on phones). */
const nestedRow = '!pl-3 !pr-0 !py-2'

function NestedEmpty({ children }: { children: ReactNode }) {
  return <li className={`pl-3 py-2 ${metaText}`}>{children}</li>
}

// ── Step status constants (kept for backward compatibility) ─────────────────

export const stepStatusColors: Record<StepStatus, string> = {
  pending: 'bg-white/[0.15]',
  in_progress: 'bg-indigo-500',
  completed: 'bg-emerald-500',
  skipped: 'bg-gray-600',
}

export const stepStatusLabels: Record<StepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  skipped: 'Skipped',
}

// ── Step rows (read-only) ────────────────────────────────────────────────────

function StepRowBase({
  index,
  description,
  status,
  verification,
}: {
  index: number
  description: string
  status: string
  verification?: string
}) {
  const label = getStatusMeta('step', status).label
  return (
    <EntityRow
      className={nestedRow}
      leading={<StatusDot kind="step" status={status} label={label} />}
      title={description}
      muted={status === 'completed' || status === 'skipped'}
      description={verification ? `Verify: ${verification}` : undefined}
      meta={[
        <StatusText key="s" kind="step" status={status} dot={false} />,
        <span key="n" className="tabular-nums">
          #{index + 1}
        </span>,
      ]}
    />
  )
}

export function CompactStepRow({ step, index }: { step: Step; index: number }) {
  return <StepRowBase index={index} description={step.description} status={step.status} verification={step.verification} />
}

function MilestoneStepRow({ step, index }: { step: MilestoneStepSummary; index: number }) {
  return <StepRowBase index={index} description={step.description} status={step.status} verification={step.verification} />
}

// ── Task rows ────────────────────────────────────────────────────────────────

/** Fetches a task's steps on mount / refresh and answers expand/collapse-all signals. */
function useTaskSteps(taskId: string, refreshTrigger?: number) {
  const [steps, setSteps] = useState<Step[]>([])
  const fetchSteps = useCallback(async () => {
    try {
      const response = await tasksApi.listSteps(taskId)
      setSteps(Array.isArray(response) ? response : [])
    } catch {
      setSteps([])
    }
  }, [taskId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from external API
    fetchSteps()
  }, [refreshTrigger, fetchSteps])
  return steps
}

function useExpandSignals(expandAllSignal?: number, collapseAllSignal?: number) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (expandAllSignal) setExpanded(true)
  }, [expandAllSignal])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal-driven toggle from parent
    if (collapseAllSignal) setExpanded(false)
  }, [collapseAllSignal])
  return [expanded, setExpanded] as const
}

function TaskRowBase({
  id,
  title,
  status,
  priority,
  href,
  steps,
  expanded,
  onToggle,
  nested,
}: {
  id: string
  title: string
  status: string
  priority?: number
  href: string
  steps: { id?: string; description: string; status: string; verification?: string }[]
  expanded: boolean
  onToggle: () => void
  nested?: boolean
}) {
  const done = steps.filter((s) => s.status === 'completed').length
  return (
    <EntityRow
      className={nested ? nestedRow : ''}
      title={title}
      entityRef={{ kind: 'task', id }}
      href={href}
      muted={status === 'completed'}
      leading={
        steps.length > 0 ? (
          <Disclosure expanded={expanded} onToggle={onToggle} label={`${expanded ? 'Hide' : 'Show'} steps of ${title}`} />
        ) : (
          <LeadingSpacer />
        )
      }
      meta={[
        <StatusText key="s" kind="task" status={status} />,
        <PriorityText key="p" priority={priority} />,
        steps.length > 0 ? (
          <span key="st" className="tabular-nums">
            {done}/{pluralize(steps.length, 'step')}
          </span>
        ) : null,
      ]}
    >
      {expanded && steps.length > 0 && (
        <NestedList label={`Steps of ${title}`}>
          {steps.map((step, i) => (
            <StepRowBase
              key={step.id || `${id}-${i}`}
              index={i}
              description={step.description}
              status={step.status}
              verification={step.verification}
            />
          ))}
        </NestedList>
      )}
    </EntityRow>
  )
}

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
  planId?: string
  planTitle?: string
}) {
  const wsSlug = useWorkspaceSlug()
  const steps = useTaskSteps(task.id, refreshTrigger)
  const [expanded, setExpanded] = useExpandSignals(expandAllSignal, collapseAllSignal)
  return (
    <TaskRowBase
      nested
      id={task.id}
      title={task.title || task.description}
      status={task.status}
      priority={task.priority}
      href={workspacePath(wsSlug, `/tasks/${task.id}`)}
      steps={steps}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    />
  )
}

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
  const steps = useTaskSteps(task.id, refreshTrigger)
  const [expanded, setExpanded] = useExpandSignals(expandAllSignal, collapseAllSignal)
  return (
    <TaskRowBase
      id={task.id}
      title={task.title || task.description}
      status={task.status}
      priority={task.priority}
      href={workspacePath(wsSlug, `/tasks/${task.id}`)}
      steps={steps}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    />
  )
}

function MilestoneTaskRow({ task, wsSlug }: { task: MilestoneTaskSummary; wsSlug: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <TaskRowBase
      nested
      id={task.id}
      title={task.title || task.description}
      status={task.status}
      priority={task.priority}
      href={workspacePath(wsSlug, `/tasks/${task.id}`)}
      steps={task.steps}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    />
  )
}

// ── Plan rows ────────────────────────────────────────────────────────────────

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
  /** Extra state to pass to the plan Link (e.g. project context) */
  linkState?: Record<string, unknown>
}) {
  const wsSlug = useWorkspaceSlug()
  const [expanded, setExpanded] = useExpandSignals(expandAllSignal, collapseAllSignal)
  const [tasks, setTasks] = useState<Task[]>([])

  const fetchTasks = useCallback(async () => {
    try {
      const data = await tasksApi.list({ plan_id: plan.id, limit: 100 })
      setTasks(data.items || [])
    } catch {
      setTasks([])
    }
  }, [plan.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from external API
    fetchTasks()
  }, [refreshTrigger, fetchTasks])

  return (
    <EntityRow
      title={plan.title}
      entityRef={{ kind: 'plan', id: plan.id }}
      href={workspacePath(wsSlug, `/plans/${plan.id}`)}
      description={plan.description || undefined}
      muted={plan.status === 'completed' || plan.status === 'cancelled'}
      leading={
        <Disclosure expanded={expanded} onToggle={() => setExpanded((v) => !v)} label={`${expanded ? 'Hide' : 'Show'} tasks of ${plan.title}`} />
      }
      meta={[
        <StatusMenu key="s" kind="plan" status={plan.status} onChange={onStatusChange} />,
        <PriorityText key="p" priority={plan.priority} />,
        tasks.length > 0 ? pluralize(tasks.length, 'task') : null,
      ]}
    >
      {expanded && (
        <NestedList label={`Tasks of ${plan.title}`}>
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <NestedTaskRow
                key={task.id}
                task={task}
                refreshTrigger={refreshTrigger}
                expandAllSignal={expandAllSignal}
                collapseAllSignal={collapseAllSignal}
                planId={plan.id}
                planTitle={plan.title}
              />
            ))
          ) : (
            <NestedEmpty>No tasks</NestedEmpty>
          )}
        </NestedList>
      )}
    </EntityRow>
  )
}

/** Plan of a milestone (enriched data: tasks + steps already loaded). */
export function MilestonePlanRow({ plan, wsSlug, nested }: { plan: MilestonePlanSummary; wsSlug: string; nested?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const total = plan.tasks.length
  const done = plan.tasks.filter((t) => t.status === 'completed').length

  return (
    <EntityRow
      className={nested ? nestedRow : ''}
      title={plan.title}
      entityRef={{ kind: 'plan', id: plan.id }}
      href={workspacePath(wsSlug, `/plans/${plan.id}`)}
      muted={plan.status === 'completed' || plan.status === 'cancelled'}
      leading={
        total > 0 ? (
          <Disclosure expanded={expanded} onToggle={() => setExpanded((v) => !v)} label={`${expanded ? 'Hide' : 'Show'} tasks of ${plan.title}`} />
        ) : (
          <LeadingSpacer />
        )
      }
      meta={[
        plan.status ? <StatusText key="s" kind="plan" status={plan.status} /> : null,
        total > 0 ? (
          <span key="t" className="tabular-nums">
            {done}/{pluralize(total, 'task')}
          </span>
        ) : (
          'No tasks'
        ),
      ]}
    >
      {expanded && total > 0 && (
        <NestedList label={`Tasks of ${plan.title}`}>
          {plan.tasks.map((task) => (
            <MilestoneTaskRow key={task.id} task={task} wsSlug={wsSlug} />
          ))}
        </NestedList>
      )}
    </EntityRow>
  )
}

// Re-export for pages rendering enriched step lists
export { MilestoneStepRow }

// ── Milestone row (Milestone → Plans → Tasks → Steps) ───────────────────────

export function ExpandableMilestoneRow({
  milestone,
  progress,
  refreshTrigger,
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
    const next = !expanded
    setExpanded(next)
    if (next && !loaded) fetchEnrichedData()
  }

  const completed = progress?.completed ?? 0
  const total = progress?.total ?? 0

  return (
    <EntityRow
      title={milestone.title}
      href={workspacePath(wsSlug, `/project-milestones/${milestone.id}`)}
      muted={milestone.status === 'completed' || milestone.status === 'closed'}
      leading={
        <Disclosure expanded={expanded} onToggle={handleToggle} label={`${expanded ? 'Hide' : 'Show'} plans of ${milestone.title}`} />
      }
      trailing={total > 0 ? `${Math.round(progress?.percentage ?? 0)}%` : undefined}
      meta={[
        <StatusText key="s" kind="milestone" status={milestone.status} />,
        total > 0 ? (
          <span key="p" className="tabular-nums">
            {completed}/{pluralize(total, 'task')}
          </span>
        ) : null,
        milestone.target_date ? `due ${formatDay(milestone.target_date)}` : null,
      ]}
      context={total > 0 ? <ProgressLine value={progress?.percentage ?? 0} label={`${milestone.title} progress`} /> : undefined}
    >
      {expanded && (
        <NestedList label={`Plans of ${milestone.title}`}>
          {loading && !loaded ? (
            <li className="!px-0">
              <EntityRowSkeleton />
            </li>
          ) : plans.length > 0 ? (
            plans.map((plan) => <MilestonePlanRow key={plan.id} plan={plan} wsSlug={wsSlug} nested />)
          ) : (
            <NestedEmpty>No plans linked</NestedEmpty>
          )}
        </NestedList>
      )}
    </EntityRow>
  )
}
