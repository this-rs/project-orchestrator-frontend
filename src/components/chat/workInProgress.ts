/**
 * What the conversation is working on, for the work bar above the composer
 * (`WorkBar`): the plans and tasks it is linked to (`useTimelineContext` →
 * `work`) that are still open, the current task, and where each task is in its
 * steps.
 *
 * Pure, so the rules are tested without a DOM (`workInProgress.test.ts`):
 * - a task is listed while it is `in_progress` or `blocked` (stuck, but not done);
 * - a plan is listed while it is `in_progress`, or when one of the listed tasks
 *   belongs to it (its own status is then shown as it is);
 * - nothing listed → `null`, and the bar renders nothing.
 */
import type { TimelineWork, TimelineWorkStep } from '@/components/timeline'

export interface WorkStepProgress {
  done: number
  total: number
  /** The step being worked on (the first `in_progress`, else the first not done). */
  current?: string
}

export interface WorkRow {
  kind: 'plan' | 'task'
  id: string
  title: string
  status: string
  /** A task listed under its plan's row. */
  nested?: boolean
  steps?: WorkStepProgress
}

export interface WorkSummary {
  /** Plans first, each followed by its tasks, then the tasks without a listed plan. */
  rows: WorkRow[]
  planCount: number
  taskCount: number
  /** The task the collapsed bar names: the first `in_progress` one, else the first listed. */
  current?: WorkRow
}

const OPEN_TASK = new Set(['in_progress', 'blocked'])
const DONE_STEP = new Set(['completed', 'skipped'])

function stepProgress(steps: ReadonlyArray<TimelineWorkStep>): WorkStepProgress | undefined {
  if (steps.length === 0) return undefined
  const sorted = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const current = sorted.find((s) => s.status === 'in_progress') ?? sorted.find((s) => !DONE_STEP.has(s.status))
  return { done: sorted.filter((s) => DONE_STEP.has(s.status)).length, total: sorted.length, current: current?.description }
}

export function deriveWorkInProgress(work: TimelineWork | undefined): WorkSummary | null {
  if (!work) return null
  const tasks = work.tasks.filter((t) => OPEN_TASK.has(t.status))
  const taskPlans = new Set(tasks.map((t) => t.planId).filter((id): id is string => !!id))
  const plans = work.plans.filter((p) => p.status === 'in_progress' || taskPlans.has(p.id))
  if (plans.length === 0 && tasks.length === 0) return null

  const toRow = (t: (typeof tasks)[number], nested: boolean): WorkRow => ({
    kind: 'task',
    id: t.id,
    title: t.title,
    status: t.status,
    nested: nested || undefined,
    steps: stepProgress(t.steps),
  })
  const rows: WorkRow[] = []
  const placed = new Set<string>()
  for (const plan of plans) {
    rows.push({ kind: 'plan', id: plan.id, title: plan.title, status: plan.status ?? 'pending' })
    for (const task of tasks) {
      if (task.planId === plan.id) {
        rows.push(toRow(task, true))
        placed.add(task.id)
      }
    }
  }
  for (const task of tasks) if (!placed.has(task.id)) rows.push(toRow(task, false))

  const taskRows = rows.filter((r) => r.kind === 'task')
  return {
    rows,
    planCount: plans.length,
    taskCount: tasks.length,
    current: taskRows.find((r) => r.status === 'in_progress') ?? taskRows[0],
  }
}
