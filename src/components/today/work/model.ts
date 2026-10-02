import type { Plan, Project, Task, TaskWithPlan } from '@/types'
import type { PlanRun } from '@/services/runner'
import type { TaskCounts } from '@/services/progress'
import { isDoneToday } from './dayPlan'

/** A task together with the plan it belongs to (the plan is what the user recognises it by). */
export interface WorkTask {
  task: Task
  planId: string | null
  planTitle: string | null
  /** Slug of the workspace the plan lives in, when known (needed to link to the task). */
  workspace: string | null
}

export interface WorkChain {
  plan: Plan
  workspace: string | null
  project: Project | null
  counts: TaskCounts | null
  /** Most recent run of this plan, if any. */
  run: PlanRun | null
}

export interface WorkDashboard {
  /** The day plan, resolved to tasks, in the user's order. `done` = completed today. */
  day: { item: WorkTask; done: boolean }[]
  /** Tasks being worked on right now, across every plan. */
  inProgress: WorkTask[]
  /** The next actionable task of each active plan (dependencies respected by the backend). */
  next: WorkTask[]
  blocked: WorkTask[]
  /** Active plans with their progress and last run. */
  chains: WorkChain[]
  /** Ids of plans that have a run executing right now. */
  runningPlanIds: Set<string>
}

export interface DashboardInput {
  plans: Plan[]
  inProgress: TaskWithPlan[]
  blocked: TaskWithPlan[]
  pending: TaskWithPlan[]
  /** `getNextTask` result per plan id (null = nothing actionable). */
  nextByPlan: Record<string, Task | null>
  /** Tasks fetched by id because the lists above did not contain them (day plan). */
  extra: WorkTask[]
  counts: Record<string, TaskCounts>
  runs: PlanRun[]
  projects: Project[]
  /** Plan id → workspace slug. */
  workspaceByPlan: Record<string, string>
  dayIds: string[]
  now?: Date
}

const byPriorityDesc = (a: { priority?: number }, b: { priority?: number }) => (b.priority ?? 0) - (a.priority ?? 0)

const fromList = (t: TaskWithPlan, ws: Record<string, string>): WorkTask => ({
  task: t,
  planId: t.plan_id,
  planTitle: t.plan_title,
  workspace: ws[t.plan_id] ?? null,
})

/** The latest run per plan (runs come newest-first from the API, but do not rely on it). */
export function latestRunByPlan(runs: PlanRun[]): Map<string, PlanRun> {
  const out = new Map<string, PlanRun>()
  for (const r of runs) {
    const cur = out.get(r.plan_id)
    if (!cur || r.started_at > cur.started_at) out.set(r.plan_id, r)
  }
  return out
}

export function buildDashboard(input: DashboardInput): WorkDashboard {
  const now = input.now ?? new Date()
  const plansById = new Map(input.plans.map((p) => [p.id, p]))
  const planOrder = [...input.plans].sort(byPriorityDesc)
  const runs = latestRunByPlan(input.runs)
  const projects = new Map(input.projects.map((p) => [p.id, p]))

  const known = new Map<string, WorkTask>()
  for (const t of [...input.pending, ...input.blocked, ...input.inProgress]) known.set(t.id, fromList(t, input.workspaceByPlan))
  for (const e of input.extra) if (!known.has(e.task.id)) known.set(e.task.id, e)

  const next: WorkTask[] = []
  for (const plan of planOrder) {
    const t = input.nextByPlan[plan.id]
    if (t) next.push({ task: t, planId: plan.id, planTitle: plan.title, workspace: input.workspaceByPlan[plan.id] ?? null })
  }
  next.sort((a, b) => byPriorityDesc(a.task, b.task))

  const day: WorkDashboard['day'] = []
  for (const id of input.dayIds) {
    const item = known.get(id) ?? next.find((n) => n.task.id === id)
    if (!item) continue
    const done = item.task.status === 'completed'
    // Finished on a previous day: it has served its purpose, it leaves the plan.
    if (done && !isDoneToday(item.task.completed_at, now)) continue
    day.push({ item, done })
  }

  const chains: WorkChain[] = planOrder.map((plan) => ({
    plan,
    workspace: input.workspaceByPlan[plan.id] ?? null,
    project: plan.project_id ? (projects.get(plan.project_id) ?? null) : null,
    counts: input.counts[plan.id] ?? null,
    run: runs.get(plan.id) ?? null,
  }))

  const runningPlanIds = new Set<string>()
  for (const [planId, run] of runs) if (run.status === 'running' && plansById.has(planId)) runningPlanIds.add(planId)

  return {
    day,
    inProgress: input.inProgress.map((t) => fromList(t, input.workspaceByPlan)).sort((a, b) => byPriorityDesc(a.task, b.task)),
    next,
    blocked: input.blocked.map((t) => fromList(t, input.workspaceByPlan)).sort((a, b) => byPriorityDesc(a.task, b.task)),
    chains,
    runningPlanIds,
  }
}
