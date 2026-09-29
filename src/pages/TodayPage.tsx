import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { tasksApi } from '@/services'
import {
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  ListGroup,
  PageShell,
  PriorityText,
  RelativeTime,
  StatusDot,
  StatusMenu,
  hitArea,
  inlineLink,
  rowInteractive,
} from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import type { TaskStatus, TaskWithPlan } from '@/types'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'

/** Sections in reading order: what moves, what is stuck, what to pick up. */
const SECTIONS: { key: TaskStatus; title: string; limit: number }[] = [
  { key: 'in_progress', title: 'In progress', limit: 50 },
  { key: 'blocked', title: 'Blocked', limit: 50 },
  { key: 'pending', title: 'Up next', limit: 12 },
]

type Buckets = Record<string, { items: TaskWithPlan[]; total: number }>

/**
 * Today — the one screen to open in the morning.
 * Not a new data model: it is the task list cut by what needs a decision now.
 */
export function TodayPage() {
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const [buckets, setBuckets] = useState<Buckets>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const results = await Promise.all(
        SECTIONS.map((s) =>
          tasksApi.list({
            workspace_slug: wsSlug,
            status: s.key,
            limit: s.limit,
            sort_by: 'priority',
            sort_order: 'desc',
          }),
        ),
      )
      const next: Buckets = {}
      SECTIONS.forEach((s, i) => {
        next[s.key] = { items: results[i].items ?? [], total: results[i].total ?? results[i].items?.length ?? 0 }
      })
      setBuckets(next)
    } catch {
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

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

  const empty = SECTIONS.every((s) => (buckets[s.key]?.items.length ?? 0) === 0)

  return (
    <PageShell title={NOMENCLATURE.today.plural} description={NOMENCLATURE.today.description} width="wide">
      {loading ? (
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
                  {bucket.items.map((task) => (
                    <EntityRow
                      key={task.id}
                      title={task.title || task.description}
                      href={workspacePath(wsSlug, `/tasks/${task.id}`)}
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
                            to={workspacePath(wsSlug, `/plans/${task.plan_id}`)}
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
