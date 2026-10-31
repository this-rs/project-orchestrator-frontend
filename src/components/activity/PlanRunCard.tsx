/**
 * A plan execution, as a card: how far the run got, what its agents are doing
 * this second, and what it has cost.
 *
 * The anatomy is the run's own — a progress bar over the plan's tasks, the
 * current wave, and one line per active agent — because a plan run is the only
 * kind of run that has *waves* and *parallel tasks*. Showing the same three
 * bullets on every card type is what makes dashboards unreadable.
 */
import { Badge, ProgressBar } from '@/components/ui'
import { formatCost } from '@/components/ui/format'
import { useElapsedTime } from '@/hooks/useElapsedTime'
import { useT } from '@/i18n'
import type { PlanRunActivity } from '@/types/activity'
import { ActivityCard } from './ActivityCard'
import { CATEGORY_META } from './categoryMeta'
import { runStatusBadge, statusDotClass } from './statusMeta'

interface PlanRunCardProps {
  run: PlanRunActivity
  href: string
  pulseSeq: number
  pulseEnabled: boolean
}

export function PlanRunCard({ run, href, pulseSeq, pulseEnabled }: PlanRunCardProps) {
  const { t } = useT()
  const meta = CATEGORY_META.plan_run
  const elapsed = useElapsedTime(run.started_at, run.status === 'running')
  const status = runStatusBadge(run.status)
  const total = Math.max(run.total_tasks, 0)
  const done = run.completed_tasks

  return (
    <ActivityCard
      cardId={`activity-card-${run.run_id}`}
      icon={meta.icon}
      tint={meta.tint}
      kind={t('nomenclature.plans.singular')}
      title={run.plan_title ?? run.plan_id}
      href={href}
      trailing={
        <>
          <div>{elapsed}</div>
          {formatCost(run.cost_usd) && <div className="text-gray-500">{formatCost(run.cost_usd)}</div>}
        </>
      }
      pulseSeq={pulseSeq}
      pulseEnabled={pulseEnabled}
      status={
        <>
          <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
          {total > 0 && (
            <span className="text-[11px] tabular-nums text-gray-400">
              {done}/{total}
            </span>
          )}
          {run.current_wave > 0 && (
            <span className="text-[11px] text-gray-500">{t('waves.column.wave', { number: run.current_wave })}</span>
          )}
          {run.failed_tasks > 0 && (
            <Badge variant="error">{run.failed_tasks}</Badge>
          )}
        </>
      }
    >
      {total > 0 && (
        <div className="mt-2.5">
          <ProgressBar value={done} max={total} size="sm" shimmer={run.status === 'running'} />
        </div>
      )}

      {run.active_tasks.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] text-gray-500">{t('activity.hub.activeTasks')}</p>
          <ul className="mt-1 space-y-0.5">
            {run.active_tasks.slice(0, 3).map((task) => (
              <li key={task.task_id} className="flex items-center gap-1.5 text-xs text-gray-300">
                <span className={`size-1.5 shrink-0 rounded-full ${statusDotClass(task.status)}`} aria-hidden="true" />
                <span className="truncate" title={task.title}>
                  {task.title}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-[11px] text-gray-500">
                  {formatCost(task.cost_usd)}
                </span>
              </li>
            ))}
            {run.active_tasks.length > 3 && (
              <li className="text-[11px] text-gray-500">+{run.active_tasks.length - 3}</li>
            )}
          </ul>
        </div>
      )}

      {run.git_branch && run.active_tasks.length === 0 && (
        <p className="mt-2 truncate font-mono text-[11px] text-gray-500" title={run.git_branch}>
          {run.git_branch}
        </p>
      )}
    </ActivityCard>
  )
}
