import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { ArrowDown, ArrowUp, CalendarPlus, Check, Circle, FolderGit2, ListTodo, Play, RotateCcw, X } from 'lucide-react'
import { projectsAtom } from '@/atoms'
import {
  Button,
  EmptyState,
  EntityRow,
  ErrorState,
  Fact,
  ListGroup,
  PriorityText,
  ProgressLine,
  Skeleton,
  StatusDot,
  StatusText,
  type OverflowMenuAction,
} from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { runnerApi, planRunTarget } from '@/services/runner'
import { tasksApi } from '@/services/tasks'
import type { TaskStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { addToDay, loadDayPlan, moveInDay, removeFromDay, saveDayPlan, type DayPlan } from './dayPlan'
import type { WorkChain, WorkTask } from './model'
import { WORK_TEXT } from './text'
import { useWorkDashboard } from './useWorkDashboard'

const taskTitle = (t: WorkTask) => t.task.title || t.task.description.split('\n')[0] || WORK_TEXT.untitled
const taskHref = (t: WorkTask) => (t.workspace ? workspacePath(t.workspace, `/tasks/${t.task.id}`) : undefined)

function planFact(t: WorkTask) {
  return t.planTitle ? (
    <Fact key="plan" icon={ListTodo} title="Plan" truncateAt="max-w-[16rem]">
      {t.planTitle}
    </Fact>
  ) : null
}

function Count({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>
}

export interface WorkDashboardProps {
  workspaces: string[]
  lane: string | null
  /**
   * Plans the page already shows elsewhere (running, waiting on the user, or to resume):
   * they are left out of "Plans à lancer", so a plan appears once on the page.
   */
  shownPlanIds?: ReadonlySet<string>
}

/**
 * The user's own work for the day, as ONE column (it sits under the request queue of the
 * page): the day plan, what is in progress, what is blocked, what to take next, and the
 * active plans that are not running yet. It has no summary line of its own: the page has one.
 *
 * Row grammar (DESIGN.md §5, §9): ONE visible action per row (`primaryAction`), everything
 * else in the `⋯` menu. Only one button of the whole dashboard is filled: "Démarrer" on the
 * next task of the day; every other action is a quiet button.
 */
export function WorkDashboard({ workspaces, lane, shownPlanIds }: WorkDashboardProps) {
  const toast = useToast()
  const projects = useAtomValue(projectsAtom)
  const [plan, setPlan] = useState<DayPlan>(() => loadDayPlan(typeof localStorage === 'undefined' ? null : localStorage))
  const [busy, setBusy] = useState<Set<string>>(new Set())

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
    (c: WorkChain) => {
      const project = c.project ?? projects.find((p) => p.id === c.plan.project_id) ?? null
      const { cwd, projectSlug } = planRunTarget(project)
      return run(c.plan.id, () => runnerApi.startRun(c.plan.id, cwd, projectSlug), WORK_TEXT.launched)
    },
    [run, projects],
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

  const taskRow = (
    t: WorkTask,
    row: { primary?: ReactNode; menu?: OverflowMenuAction[]; leading?: ReactNode; muted?: boolean },
  ) => (
    <EntityRow
      key={t.task.id}
      title={taskTitle(t)}
      href={taskHref(t)}
      leading={row.leading}
      muted={row.muted}
      status={[<StatusText key="s" kind="task" status={t.task.status} label={WORK_TEXT.taskStatus[t.task.status] ?? t.task.status} icon />, <PriorityText key="p" priority={t.task.priority} />]}
      meta={[planFact(t)]}
      primaryAction={row.primary}
      actions={row.menu && row.menu.some((a) => !a.hidden) ? row.menu : undefined}
    />
  )

  return (
    <div className="space-y-4" data-testid="work-dashboard">
      <div aria-live="polite">
        {stale && <p className="text-xs text-amber-300">{WORK_TEXT.stale}</p>}
        {refreshing && !stale && <span className="sr-only">Actualisation…</span>}
      </div>

      <ListGroup title={WORK_TEXT.day} count={data.day.length}>
        {data.day.length === 0 ? (
          <EmptyState size="sm" icon={<CalendarPlus className="h-5 w-5" aria-hidden="true" />} title={WORK_TEXT.dayEmpty} description={WORK_TEXT.dayEmptyHint} />
        ) : (
          data.day.map(({ item, done }, i) =>
            taskRow(item, {
              muted: done,
              leading: (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0! py-0!"
                  aria-label={WORK_TEXT.completeAria(taskTitle(item))}
                  aria-pressed={done}
                  disabled={done || busy.has(item.task.id)}
                  onClick={() => void setTaskStatus(item, 'completed')}
                >
                  {done ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                </Button>
              ),
              primary:
                item.task.id === nextOfDay ? (
                  <Button size="sm" data-next-of-day disabled={busy.has(item.task.id)} onClick={() => start(item)}>
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
        )}
      </ListGroup>

      <ListGroup title={WORK_TEXT.inProgress} count={inProgress.length}>
        {inProgress.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">{WORK_TEXT.inProgressEmpty}</p>
        ) : (
          inProgress.map((t) =>
            taskRow(t, {
              leading: <StatusDot kind="task" status="in_progress" label="En cours" pulse />,
              primary: (
                <Button variant="secondary" size="sm" disabled={busy.has(t.task.id)} onClick={() => void setTaskStatus(t, 'completed')}>
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {WORK_TEXT.complete}
                </Button>
              ),
              menu: [addToDayAction(t)],
            }),
          )
        )}
      </ListGroup>

      {data.blocked.length > 0 && (
        <ListGroup title={WORK_TEXT.blocked} count={data.blocked.length}>
          {data.blocked.map((t) => taskRow(t, { menu: [addToDayAction(t)] }))}
        </ListGroup>
      )}

      <ListGroup title={WORK_TEXT.next} count={next.length}>
        {next.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">{WORK_TEXT.nextEmpty}</p>
        ) : (
          next.map((t) =>
            taskRow(t, {
              primary: (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`${WORK_TEXT.addToDay} : ${taskTitle(t)}`}
                  onClick={() => edit((p) => addToDay(p, t.task.id))}
                >
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {WORK_TEXT.add}
                </Button>
              ),
              menu: [startAction(t)],
            }),
          )
        )}
      </ListGroup>

      {toLaunch.length > 0 && (
        <ListGroup title={WORK_TEXT.chains} count={toLaunch.length}>
          {toLaunch.map((c) => (
            <ChainRow key={c.plan.id} chain={c} lane={lane} busy={busy} onLaunch={launch} />
          ))}
        </ListGroup>
      )}
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
        <PriorityText key="p" priority={plan.priority} />,
      ]}
      meta={[
        project ? (
          <Fact key="pr" icon={FolderGit2} title="Projet" truncateAt="max-w-[12rem]">
            {project.name}
          </Fact>
        ) : null,
        counts ? (
          <Fact key="c" title="Tâches terminées">
            <Count>
              {counts.completed}/{counts.total}
            </Count>
          </Fact>
        ) : null,
      ]}
      context={counts ? <ProgressLine value={counts.percentage} segments={segments} label={`Avancement de ${plan.title}`} /> : undefined}
      primaryAction={
        running ? undefined : (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => void onLaunch(chain)}>
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
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du tableau de bord">
      {[0, 1].map((b) => (
        <div key={b} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}
