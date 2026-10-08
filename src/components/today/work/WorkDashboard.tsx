import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { ArrowDown, ArrowUp, CalendarPlus, Check, Circle, FolderGit2, Play, RotateCcw, X } from 'lucide-react'
import { projectsAtom } from '@/atoms'
import {
  Button,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorState,
  Fact,
  ProgressLine,
  Skeleton,
  StatusDot,
  StatusText,
  ViewTabs,
  surface,
  type OverflowMenuAction,
  type ViewTab,
} from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { PANEL } from '../BandFrame'
import { useToast } from '@/hooks/useToast'
import { planRunTarget } from '@/services/runner'
import { tasksApi } from '@/services/tasks'
import type { TaskStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { addToDay, loadDayPlan, moveInDay, removeFromDay, saveDayPlan, type DayPlan } from './dayPlan'
import type { WorkChain, WorkTask } from './model'
import { RunTargetDialog } from '@/components/runner/RunTargetDialog'
import { launchRun, useRunTargetGate } from '@/hooks/useRunTargetGate'
import { WORK_TEXT } from './text'
import { useWorkDashboard } from './useWorkDashboard'

const taskTitle = (t: WorkTask) => t.task.title || t.task.description.split('\n')[0] || WORK_TEXT.untitled
const taskHref = (t: WorkTask) => (t.workspace ? workspacePath(t.workspace, `/tasks/${t.task.id}`) : undefined)

type WorkTab = 'day' | 'inProgress' | 'next' | 'blocked' | 'chains'

/** Rows shown before "Show all": a list never pushes the rest of the page out of sight. */
export const ROWS_SHOWN = 6

function Count({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>
}

export interface WorkDashboardProps {
  workspaces: string[]
  lane: string | null
  /**
   * Plans the page already shows elsewhere (running, waiting on the user, or to resume):
   * they are left out of "Plans to launch", so a plan appears once on the page.
   */
  shownPlanIds?: ReadonlySet<string>
}

/**
 * The user's own work, as ONE card with tabs (it sits under the request queue of the page):
 * the day plan, what is in progress, what to take next, what is blocked and the active plans
 * that are not running yet. One list is on screen at a time, each tab carries its count, and a
 * list longer than `ROWS_SHOWN` is cut with "Show all": five stacked lists made the page
 * five screens tall.
 *
 * Row grammar (DESIGN.md §5, §9): one LINE per task (title, its plan at the right), at most ONE
 * visible action (`primaryAction`), everything else in the `⋯` menu. Only one button of the
 * whole dashboard is filled: "Start" on the next task of the day. Every button inside a row is
 * glass without blur (`flat`, `btn-flat`): the blur budget is about ten on screen, a list has more rows.
 */
export function WorkDashboard({ workspaces, lane, shownPlanIds }: WorkDashboardProps) {
  const toast = useToast()
  const projects = useAtomValue(projectsAtom)
  const [plan, setPlan] = useState<DayPlan>(() => loadDayPlan(typeof localStorage === 'undefined' ? null : localStorage))
  const [busy, setBusy] = useState<Set<string>>(new Set())
  /** The tab the user picked; null = the page chooses (see `fallback`). */
  const [picked, setPicked] = useState<WorkTab | null>(null)
  /** Tabs whose list is shown whole. */
  const [expanded, setExpanded] = useState<ReadonlySet<WorkTab>>(new Set())

  const gate = useRunTargetGate()
  const { status, data, refresh, refreshing, stale, error } = useWorkDashboard(workspaces, plan.ids)

  const edit = useCallback((fn: (p: DayPlan) => DayPlan) => {
    setPlan((cur) => {
      const next = fn(cur)
      if (next !== cur) saveDayPlan(typeof localStorage === 'undefined' ? null : localStorage, next)
      return next
    })
  }, [])

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, success: string) => {
      setBusy((b) => new Set(b).add(key))
      try {
        await action()
        toast.success(success)
        refresh()
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : WORK_TEXT.actionFailed)
      } finally {
        setBusy((b) => {
          const n = new Set(b)
          n.delete(key)
          return n
        })
      }
    },
    [toast, refresh],
  )

  const setTaskStatus = useCallback(
    (t: WorkTask, to: TaskStatus) =>
      run(t.task.id, () => tasksApi.update(t.task.id, { status: to }), to === 'completed' ? WORK_TEXT.completed : WORK_TEXT.started),
    [run],
  )

  const launch = useCallback(
    async (c: WorkChain) => {
      const project = c.project ?? projects.find((p) => p.id === c.plan.project_id) ?? null
      const { cwd, projectSlug } = planRunTarget(project)
      await gate.ask({
        title: c.plan.title ?? c.plan.id,
        projectSlug,
        run: (options) => run(c.plan.id, () => launchRun(c.plan.id, cwd, projectSlug, options), WORK_TEXT.launched),
      })
    },
    [run, projects, gate],
  )

  const dayIds = useMemo(() => new Set(plan.ids), [plan.ids])

  if (status === 'loading') return <DashboardSkeleton />
  if (status === 'error' || !data) {
    return <ErrorState title={WORK_TEXT.loadError} description={error ?? undefined} onRetry={refresh} />
  }

  // A task already on today's plan is shown there, once.
  const inProgress = data.inProgress.filter((t) => !dayIds.has(t.task.id))
  const next = data.next.filter((t) => !dayIds.has(t.task.id))
  // A plan that runs, waits on the user or is to resume is shown by the page's queue, once.
  const toLaunch = data.chains.filter((c) => !shownPlanIds?.has(c.plan.id) && c.run?.status !== 'running')
  // The next task of the day: the first one still to start. It alone carries the filled button.
  const nextOfDay = data.day.find((d) => !d.done && d.item.task.status === 'pending')?.item.task.id ?? null

  const start = (t: WorkTask) => {
    edit((p) => addToDay(p, t.task.id))
    void setTaskStatus(t, 'in_progress')
  }

  const addToDayAction = (t: WorkTask): OverflowMenuAction => ({
    label: WORK_TEXT.addToDay,
    icon: CalendarPlus,
    hidden: dayIds.has(t.task.id),
    onClick: () => edit((p) => addToDay(p, t.task.id)),
  })
  const startAction = (t: WorkTask): OverflowMenuAction => ({
    label: WORK_TEXT.start,
    icon: Play,
    hidden: t.task.status !== 'pending',
    disabled: busy.has(t.task.id),
    onClick: () => start(t),
  })

  // One line per task: the tab already says its state, the plan it belongs to sits at the right.
  const taskRow = (
    t: WorkTask,
    row: { primary?: ReactNode; menu?: OverflowMenuAction[]; leading?: ReactNode; muted?: boolean; state?: boolean },
  ) => (
    <EntityRow
      key={t.task.id}
      title={taskTitle(t)}
      entityRef={{ kind: 'task', id: t.task.id }}
      titleLines={1}
      href={taskHref(t)}
      leading={row.leading}
      muted={row.muted}
      trailing={
        <span className="flex items-center gap-3">
          {row.state && t.task.status !== 'pending' && (
            <StatusText kind="task" status={t.task.status} label={WORK_TEXT.taskStatus[t.task.status] ?? t.task.status} />
          )}
          {t.planTitle && (
            <span title={t.planTitle} className="hidden max-w-[14rem] truncate @2xl/tasks:inline">
              {t.planTitle}
            </span>
          )}
        </span>
      }
      primaryAction={row.primary}
      actions={row.menu && row.menu.some((a) => !a.hidden) ? row.menu : undefined}
    />
  )

  const dayRows = data.day.map(({ item, done }, i) =>
    taskRow(item, {
      muted: done,
      state: true,
      leading: (
        // The check of the day: a square ghost icon button, flat (one per row).
        <button
          type="button"
          className={`${iconButton('ghost', 'size-9')} ${glassFlat} -my-2`}
          aria-label={WORK_TEXT.completeAria(taskTitle(item))}
          aria-pressed={done}
          disabled={done || busy.has(item.task.id)}
          onClick={() => void setTaskStatus(item, 'completed')}
        >
          {done ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
        </button>
      ),
      primary:
        item.task.id === nextOfDay ? (
          <Button size="sm" flat data-next-of-day disabled={busy.has(item.task.id)} onClick={() => start(item)}>
            <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {WORK_TEXT.start}
          </Button>
        ) : undefined,
      menu: [
        { ...startAction(item), hidden: done || item.task.status !== 'pending' || item.task.id === nextOfDay },
        { label: WORK_TEXT.moveUp, icon: ArrowUp, disabled: i === 0, onClick: () => edit((p) => moveInDay(p, item.task.id, -1)) },
        { label: WORK_TEXT.moveDown, icon: ArrowDown, disabled: i === data.day.length - 1, onClick: () => edit((p) => moveInDay(p, item.task.id, 1)) },
        { label: WORK_TEXT.removeFromDay, icon: X, onClick: () => edit((p) => removeFromDay(p, item.task.id)) },
      ],
    }),
  )

  const inProgressRows = inProgress.map((t) =>
    taskRow(t, {
      leading: <StatusDot kind="task" status="in_progress" label={WORK_TEXT.taskStatus.in_progress} />,
      menu: [
        { label: WORK_TEXT.complete, icon: Check, disabled: busy.has(t.task.id), onClick: () => void setTaskStatus(t, 'completed') },
        addToDayAction(t),
      ],
    }),
  )

  const nextRows = next.map((t) =>
    taskRow(t, {
      primary: (
        <Button variant="secondary" size="sm" flat aria-label={`${WORK_TEXT.addToDay}: ${taskTitle(t)}`} onClick={() => edit((p) => addToDay(p, t.task.id))}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {WORK_TEXT.add}
        </Button>
      ),
      menu: [startAction(t)],
    }),
  )

  const blockedRows = data.blocked.map((t) => taskRow(t, { menu: [addToDayAction(t)] }))

  const panels: Record<WorkTab, { rows: ReactNode[]; empty: ReactNode }> = {
    day: {
      rows: dayRows,
      empty: (
        <EmptyState size="sm" icon={<CalendarPlus className="h-5 w-5" aria-hidden="true" />} title={WORK_TEXT.dayEmpty} description={WORK_TEXT.dayEmptyHint} />
      ),
    },
    inProgress: { rows: inProgressRows, empty: <p className="px-4 py-3 text-sm text-gray-400">{WORK_TEXT.inProgressEmpty}</p> },
    next: { rows: nextRows, empty: <p className="px-4 py-3 text-sm text-gray-400">{WORK_TEXT.nextEmpty}</p> },
    blocked: { rows: blockedRows, empty: null },
    chains: {
      rows: toLaunch.map((c) => <ChainRow key={c.plan.id} chain={c} lane={lane} busy={busy} onLaunch={launch} />),
      empty: null,
    },
  }

  // Tabs with nothing to show and nothing to say are left out (blocked, plans to launch).
  const tabs: ViewTab<WorkTab>[] = (
    [
      { id: 'day', label: WORK_TEXT.day, count: data.day.length },
      { id: 'inProgress', label: WORK_TEXT.inProgress, count: inProgress.length },
      { id: 'next', label: WORK_TEXT.next, count: next.length },
      { id: 'blocked', label: WORK_TEXT.blocked, count: data.blocked.length },
      { id: 'chains', label: WORK_TEXT.chains, count: toLaunch.length },
    ] satisfies ViewTab<WorkTab>[]
  ).filter((t) => panels[t.id].empty !== null || panels[t.id].rows.length > 0)

  // Until the user picks a tab: the day when something is planned, else what is in progress, else what to take.
  const fallback: WorkTab = data.day.length > 0 ? 'day' : inProgress.length > 0 ? 'inProgress' : 'next'
  const active: WorkTab = picked && tabs.some((t) => t.id === picked) ? picked : fallback
  const panel = panels[active]
  const open = expanded.has(active)
  const shown = open ? panel.rows : panel.rows.slice(0, ROWS_SHOWN)
  const hidden = panel.rows.length - shown.length

  return (
    <div className={`@container/tasks min-w-0 ${PANEL}`} data-testid="work-dashboard">
      <RunTargetDialog pending={gate.pending} onCancel={gate.cancel} />
      <div aria-live="polite">
        {stale && <p className="mb-2 text-xs text-amber-300">{WORK_TEXT.stale}</p>}
        {refreshing && !stale && <span className="sr-only">{WORK_TEXT.refreshing}</span>}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold tracking-tight text-gray-100">{WORK_TEXT.title}</h2>
        <ViewTabs tabs={tabs} value={active} onChange={setPicked} label={WORK_TEXT.title} />
      </div>

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === active)?.label} data-tab={active}>
        {panel.rows.length === 0 ? (
          <div>{panel.empty}</div>
        ) : (
          <EntityList variant="flush" className="-mx-3 md:-mx-4">
            {shown}
            {(hidden > 0 || (open && panel.rows.length > ROWS_SHOWN)) && (
              <li className="px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((cur) => {
                      const n = new Set(cur)
                      if (open) n.delete(active)
                      else n.add(active)
                      return n
                    })
                  }
                >
                  {open ? WORK_TEXT.showLess : WORK_TEXT.showAll(panel.rows.length)}
                </Button>
              </li>
            )}
          </EntityList>
        )}
      </div>
    </div>
  )
}

function ChainRow({
  chain,
  busy,
  onLaunch,
}: {
  chain: WorkChain
  lane: string | null
  busy: Set<string>
  onLaunch: (c: WorkChain) => Promise<unknown>
}) {
  const { plan, counts, run, project, workspace } = chain
  const running = run?.status === 'running'
  const failedLike = run && ['failed', 'cancelled', 'budget_exceeded'].includes(run.status)
  const pending = busy.has(plan.id)
  const segments = counts && counts.total > 0
    ? [
        { pct: (counts.completed / counts.total) * 100, className: 'bg-emerald-500/80' },
        { pct: (counts.in_progress / counts.total) * 100, className: 'bg-indigo-400' },
        { pct: (counts.blocked / counts.total) * 100, className: 'bg-amber-400' },
        { pct: (counts.failed / counts.total) * 100, className: 'bg-red-400' },
      ]
    : undefined

  return (
    <EntityRow
      title={plan.title}
      titleLines={1}
      entityRef={{ kind: 'plan', id: plan.id }}
      href={workspace ? workspacePath(workspace, `/plans/${plan.id}`) : undefined}
      leading={
        <StatusDot
          kind="run"
          status={run?.status ?? 'pending'}
          label={run ? (WORK_TEXT.runLabel[run.status] ?? run.status) : WORK_TEXT.neverRun}
          pulse={running}
        />
      }
      tone={running ? 'progress' : failedLike ? 'danger' : undefined}
      status={[
        <span key="s" className={failedLike ? 'text-red-300' : running ? 'text-indigo-300' : 'text-gray-400'}>
          {run ? (WORK_TEXT.runLabel[run.status] ?? run.status) : WORK_TEXT.neverRun}
        </span>,
      ]}
      meta={[
        project ? (
          <Fact key="pr" icon={FolderGit2} title={WORK_TEXT.project} truncateAt="max-w-[12rem]">
            {project.name}
          </Fact>
        ) : null,
        counts ? (
          <Fact key="c" title={WORK_TEXT.tasksDone}>
            <Count>
              {counts.completed}/{counts.total}
            </Count>
          </Fact>
        ) : null,
      ]}
      context={counts ? <ProgressLine value={counts.percentage} segments={segments} label={WORK_TEXT.progressOf(plan.title)} /> : undefined}
      primaryAction={
        running ? undefined : (
          <Button variant="secondary" size="sm" flat disabled={pending} onClick={() => void onLaunch(chain)}>
            {failedLike ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            {pending ? WORK_TEXT.launching : failedLike ? WORK_TEXT.relaunch : WORK_TEXT.launch}
          </Button>
        )
      }
    />
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={WORK_TEXT.loading}>
      {[0, 1].map((b) => (
        <div key={b} className={`${surface} p-4 space-y-3`}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}
