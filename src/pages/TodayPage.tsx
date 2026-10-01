import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { ClipboardList, Layers } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { tasksApi } from '@/services'
import {
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  ListGroup,
  PageShell,
  PriorityText,
  RelativeTime,
  Select,
  StatusDot,
  StatusMenu,
  hitArea,
  inlineLink,
  rowInteractive,
} from '@/components/ui'
import { useToast } from '@/hooks'
import type { TaskStatus, TaskWithPlan } from '@/types'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'

/** Sections in reading order: what moves, what is stuck, what to pick up. */
const SECTIONS: { key: TaskStatus; title: string; limit: number }[] = [
  { key: 'in_progress', title: 'In progress', limit: 50 },
  { key: 'blocked', title: 'Blocked', limit: 50 },
  { key: 'pending', title: 'Up next', limit: 12 },
]

/** A task and the workspace (lane) it belongs to: tasks carry no slug of their own. */
type LaneTask = { task: TaskWithPlan; ws: string }
type Buckets = Record<string, { items: LaneTask[]; total: number }>

/** Query parameter holding the lane filter on the cross-workspace entry. */
export const LANE_PARAM = 'workspace'
const ALL_LANES = ''

/**
 * Lane filter, reflected in the URL so it can be shared and Back restores it.
 * - /workspace/:slug/today : the path slug is the filter (the familiar entry);
 *   widening goes to /today, picking another lane to that lane's entry.
 * - /today                 : `?workspace=<slug>`, absent = every workspace.
 * Unknown slugs (once workspaces are loaded) are ignored, i.e. every workspace.
 */
function useLaneFilter() {
  const { slug: pathSlug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const workspaces = useAtomValue(workspacesAtom)

  const requested = pathSlug ?? searchParams.get(LANE_PARAM) ?? null
  const known = !requested || workspaces.length === 0 || workspaces.some((w) => w.slug === requested)
  const lane = known ? requested : null

  const setLane = useCallback(
    (next: string) => {
      if (pathSlug) {
        navigate(next ? workspacePath(next, '/today') : '/today')
      } else if (next) {
        setSearchParams({ [LANE_PARAM]: next })
      } else {
        setSearchParams({})
      }
    },
    [pathSlug, navigate, setSearchParams],
  )

  return { lane, setLane, workspaces }
}

/**
 * Today — the one screen to open in the morning.
 * Not a new data model: it is the task list cut by what needs a decision now.
 */
export function TodayPage() {
  const { lane, setLane, workspaces } = useLaneFilter()
  const toast = useToast()
  const [buckets, setBuckets] = useState<Buckets>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Lanes to read: the filtered one, or every workspace.
  const laneKey = lane ?? workspaces.map((w) => w.slug).join('\n')

  const load = useCallback(async () => {
    setError(null)
    const slugs = laneKey ? laneKey.split('\n') : []
    try {
      const next: Buckets = {}
      const perSection = await Promise.all(
        SECTIONS.map((s) =>
          Promise.all(
            slugs.map(async (ws) => {
              const res = await tasksApi.list({
                workspace_slug: ws,
                status: s.key,
                limit: s.limit,
                sort_by: 'priority',
                sort_order: 'desc',
              })
              return { ws, items: res.items ?? [], total: res.total ?? res.items?.length ?? 0 }
            }),
          ),
        ),
      )
      SECTIONS.forEach((s, i) => {
        const lanes = perSection[i]
        const merged: LaneTask[] = lanes
          .flatMap((l) => l.items.map((task) => ({ task, ws: l.ws })))
          .sort((a, b) => (b.task.priority ?? 0) - (a.task.priority ?? 0))
        next[s.key] = { items: merged.slice(0, s.limit), total: lanes.reduce((n, l) => n + l.total, 0) }
      })
      setBuckets(next)
    } catch {
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [laneKey])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const changeStatus = useCallback(
    async (task: TaskWithPlan, status: TaskStatus) => {
      try {
        await tasksApi.update(task.id, { status })
        toast.success('Status updated')
        await load()
      } catch {
        toast.error('Failed to update status')
      }
    },
    [load, toast],
  )

  const laneOptions = [
    { value: ALL_LANES, label: 'All workspaces' },
    ...workspaces.map((w) => ({ value: w.slug, label: w.name })),
  ]
  const laneName = lane ? (workspaces.find((w) => w.slug === lane)?.name ?? lane) : null

  const empty = SECTIONS.every((s) => (buckets[s.key]?.items.length ?? 0) === 0)

  return (
    <PageShell title={NOMENCLATURE.today.plural} description={NOMENCLATURE.today.description} width="wide"
      filters={
        <FilterBar
          filters={
            <Select
              label="Workspace"
              options={laneOptions}
              value={lane ?? ALL_LANES}
              onChange={setLane}
              icon={<Layers className="w-3 h-3" />}
            />
          }
          activeCount={lane ? 1 : 0}
          activeLabels={laneName ? [laneName] : []}
          onClear={() => setLane(ALL_LANES)}
          defaultOpen
        />
      }
    >
      {loading || (!lane && workspaces.length === 0) ? (
        <EntityListSkeleton rows={6} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : empty ? (
        <EmptyState
          title="Nothing on your plate"
          description="No task is in progress, blocked or waiting. Create a plan to get started."
        />
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((s) => {
            const bucket = buckets[s.key]
            if (!bucket || bucket.items.length === 0) return null
            return (
              <ListGroup key={s.key} title={s.title} count={bucket.total}>
                  {bucket.items.map(({ task, ws }) => (
                    <EntityRow
                      key={task.id}
                      title={task.title || task.description}
                      href={workspacePath(ws, `/tasks/${task.id}`)}
                      leading={<StatusDot kind="task" status={task.status} />}
                      trailing={<RelativeTime date={task.updated_at ?? task.created_at} />}
                      meta={[
                        <StatusMenu
                          key="status"
                          kind="task"
                          status={task.status}
                          onChange={(next) => changeStatus(task, next)}
                        />,
                        <PriorityText key="p" priority={task.priority} />,
                        task.plan_id && task.plan_title ? (
                          <Link
                            key="plan"
                            to={workspacePath(ws, `/plans/${task.plan_id}`)}
                            title={`Plan: ${task.plan_title}`}
                            className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex items-center gap-1 min-w-0`}
                          >
                            <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span className="truncate max-w-[14rem]">{task.plan_title}</span>
                          </Link>
                        ) : null,
                        task.assigned_to ? <span key="who">@{task.assigned_to}</span> : null,
                      ]}
                    />
                  ))}
              </ListGroup>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
