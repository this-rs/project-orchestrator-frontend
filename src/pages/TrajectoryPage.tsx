import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { plansApi, tasksApi } from '@/services'
import { workspacesApi } from '@/services/workspaces'
import {
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  ListGroup,
  PageShell,
  PriorityText,
  ProgressLine,
  StatusDot,
  StatusText,
  TaskProgress,
  formatDay,
  hitArea,
  inlineLink,
  rowInteractive,
} from '@/components/ui'
import { useTaskProgress, useWorkspaceSlug } from '@/hooks'
import type { MilestoneProgress, Plan, Project, TaskWithPlan, WorkspaceMilestone } from '@/types'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'

const DONE_PLAN = ['completed', 'cancelled']
const norm = (s: string | undefined) => (s || '').toLowerCase()

/** The API answers 400 to any `limit` above 100, so a bigger list is read page by page. */
const PLAN_PAGE_SIZE = 100
const PLAN_MAX_PAGES = 20

/** Every plan of the workspace — never a single oversized request, never silently truncated. */
async function listAllPlans(workspaceSlug: string): Promise<Plan[]> {
  const byId = new Map<string, Plan>()
  for (let page = 0; page < PLAN_MAX_PAGES; page++) {
    const res = await plansApi.list({ workspace_slug: workspaceSlug, limit: PLAN_PAGE_SIZE, offset: page * PLAN_PAGE_SIZE })
    const items = res.items ?? []
    for (const plan of items) byId.set(plan.id, plan)
    if (items.length < PLAN_PAGE_SIZE || byId.size >= (res.total ?? Infinity)) break
  }
  return [...byId.values()]
}

/**
 * Trajectory — objectives on top, then projects → plans → tasks, each level
 * with the same progress line. Active work is open; what is finished stays
 * one click away under « Path travelled », so the road behind is never lost.
 */
export function TrajectoryPage() {
  const wsSlug = useWorkspaceSlug()
  const [projects, setProjects] = useState<Project[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [objectives, setObjectives] = useState<(WorkspaceMilestone & { progress?: MilestoneProgress })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set())
  const [openPlans, setOpenPlans] = useState<Set<string>>(new Set())
  const [planTasks, setPlanTasks] = useState<Record<string, TaskWithPlan[]>>({})

  const load = useCallback(async () => {
    setError(null)
    try {
      const [proj, allPlans, ms] = await Promise.all([
        workspacesApi.listProjects(wsSlug),
        listAllPlans(wsSlug),
        workspacesApi.listMilestones(wsSlug, { limit: 50 }).catch(() => ({ items: [] as WorkspaceMilestone[] })),
      ])
      const msList = Array.isArray(ms) ? ms : (ms.items ?? [])
      const withProgress = await Promise.all(
        msList.map(async (m) => ({ ...m, progress: await workspacesApi.getMilestoneProgress(m.id).catch(() => undefined) })),
      )
      setProjects(proj)
      setPlans(allPlans)
      setObjectives(withProgress)
      // Open projects that have live work by default.
      const live = new Set(allPlans.filter((p) => !DONE_PLAN.includes(p.status) && p.project_id).map((p) => p.project_id!))
      setOpenProjects(live)
    } catch {
      setError('Failed to load the trajectory')
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const projectProgress = useTaskProgress('project', useMemo(() => projects.map((p) => p.id), [projects]))
  const planProgress = useTaskProgress('plan', useMemo(() => plans.map((p) => p.id), [plans]))

  const plansByProject = useMemo(() => {
    const map = new Map<string, Plan[]>()
    for (const p of plans) {
      const key = p.project_id ?? '_none'
      map.set(key, [...(map.get(key) ?? []), p])
    }
    return map
  }, [plans])

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const togglePlan = async (planId: string) => {
    setOpenPlans((prev) => toggle(prev, planId))
    if (!planTasks[planId]) {
      try {
        const res = await tasksApi.list({ plan_id: planId, limit: 100, sort_by: 'priority', sort_order: 'desc' })
        setPlanTasks((prev) => ({ ...prev, [planId]: res.items ?? [] }))
      } catch {
        setPlanTasks((prev) => ({ ...prev, [planId]: [] }))
      }
    }
  }

  const renderPlan = (plan: Plan) => {
    const open = openPlans.has(plan.id)
    const tasks = planTasks[plan.id]
    return (
      <EntityRow
        key={plan.id}
        title={plan.title}
        onClick={() => togglePlan(plan.id)}
        expanded={open}
        chevron
        muted={DONE_PLAN.includes(plan.status)}
        leading={<StatusDot kind="plan" status={plan.status} />}
        titleSuffix={
          <Link
            to={workspacePath(wsSlug, `/plans/${plan.id}`)}
            aria-label={`Open plan ${plan.title}`}
            className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex`}
          >
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        }
        meta={[<StatusText key="s" kind="plan" status={plan.status} dot={false} />, <PriorityText key="p" priority={plan.priority} />]}
        context={<TaskProgress counts={planProgress[plan.id]} />}
      >
        {open && (
          <div className="border-l border-white/[0.06] pl-3 space-y-1">
            {tasks === undefined ? (
              <span className="text-[11px] text-gray-600">Loading…</span>
            ) : tasks.length === 0 ? (
              <span className="text-[11px] text-gray-600">No tasks</span>
            ) : (
              tasks.map((t) => (
                <Link
                  key={t.id}
                  to={workspacePath(wsSlug, `/tasks/${t.id}`)}
                  className={`${rowInteractive} ${hitArea} flex items-center gap-2 text-xs ${
                    t.status === 'completed' ? 'text-gray-500' : 'text-gray-300'
                  } hover:text-gray-100`}
                >
                  <StatusDot kind="task" status={t.status} />
                  <span className="truncate">{t.title || t.description}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </EntityRow>
    )
  }

  const renderProject = (project: Project) => {
    const all = plansByProject.get(project.id) ?? []
    const active = all.filter((p) => !DONE_PLAN.includes(p.status))
    const done = all.filter((p) => DONE_PLAN.includes(p.status))
    const open = openProjects.has(project.id)
    return (
      <div key={project.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <ul role="list" className="divide-y divide-white/[0.05]">
          <EntityRow
            title={project.name}
            onClick={() => setOpenProjects((prev) => toggle(prev, project.id))}
            expanded={open}
            chevron
            titleSuffix={
              <Link
                to={workspacePath(wsSlug, `/projects/${project.slug}`)}
                aria-label={`Open project ${project.name}`}
                className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex`}
              >
                <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            }
            meta={[
              `${active.length} active · ${done.length} finished`,
            ]}
            context={<TaskProgress counts={projectProgress[project.id]} />}
          />
          {open && active.map(renderPlan)}
          {open && done.length > 0 && (
            <li className="px-3 md:px-4 py-2">
              <details>
                <summary className="cursor-pointer text-[11px] text-gray-500 hover:text-gray-300 select-none">
                  Path travelled · {done.length}
                </summary>
                <ul role="list" className="mt-1 divide-y divide-white/[0.05]">
                  {done.map(renderPlan)}
                </ul>
              </details>
            </li>
          )}
        </ul>
      </div>
    )
  }

  const liveObjectives = objectives.filter((o) => !['completed', 'closed'].includes(norm(o.status)))
  const doneObjectives = objectives.filter((o) => ['completed', 'closed'].includes(norm(o.status)))
  const orphanPlans = plansByProject.get('_none') ?? []

  const objectiveRow = (o: (typeof objectives)[number]) => (
    <EntityRow
      key={o.id}
      title={o.title}
      href={workspacePath(wsSlug, `/milestones/${o.id}`)}
      muted={['completed', 'closed'].includes(norm(o.status))}
      trailing={o.target_date ? formatDay(o.target_date) : undefined}
      meta={[<StatusText key="s" kind="milestone" status={norm(o.status)} />]}
      context={
        o.progress && o.progress.total > 0 ? (
          <div className="flex items-center gap-3">
            <ProgressLine value={o.progress.percentage} label={`${Math.round(o.progress.percentage)}% complete`} className="max-w-[10rem]" />
            <span className="text-[11px] text-gray-500 tabular-nums">
              {o.progress.completed}/{o.progress.total} done
            </span>
          </div>
        ) : undefined
      }
    />
  )

  return (
    <PageShell title={NOMENCLATURE.trajectory.plural} description={NOMENCLATURE.trajectory.description} width="wide">
      {loading ? (
        <EntityListSkeleton rows={6} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : projects.length === 0 && objectives.length === 0 ? (
        <EmptyState title="Nothing to trace yet" description="Create a project and a plan — the trajectory builds itself from them." />
      ) : (
        <div className="space-y-8">
          {objectives.length > 0 && (
            <section aria-label="Objectives" className="space-y-2">
              <ListGroup title={NOMENCLATURE.objectives.plural} count={liveObjectives.length}>
                {liveObjectives.map(objectiveRow)}
              </ListGroup>
              {doneObjectives.length > 0 && (
                <ListGroup title="Reached" count={doneObjectives.length} collapsible defaultOpen={false}>
                  {doneObjectives.map(objectiveRow)}
                </ListGroup>
              )}
            </section>
          )}
          <section aria-label="Work in progress" className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Work</h2>
            {projects.map(renderProject)}
            {orphanPlans.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <EntityList aria-label="Plans without a project" variant="flush">
                  {orphanPlans.map(renderPlan)}
                </EntityList>
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  )
}
