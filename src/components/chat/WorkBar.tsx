/**
 * What the conversation is working on, on one line of the composer tray, under
 * what is running (`ActivityBar`): the plans and tasks it is linked to that are
 * still open (`deriveWorkInProgress`).
 *
 * Collapsed: a count of plans and tasks and the title of the current task, with
 * where it is in its steps. Expanded: one row per plan and task — status (glyph
 * + word, never colour alone), title, step progress — and the row opens the
 * plan's or the task's page.
 *
 * A block of the tray, never an overlay (the dock measures the tray, the
 * transcript keeps clear of it). Renders nothing when nothing is open.
 */
import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList, ListChecks } from 'lucide-react'
import { useT } from '@/i18n'
import type { TimelineWork } from '@/components/timeline'
import { StatusText, focusRingInset } from '@/components/ui'
import { workspacePath } from '@/utils/paths'
import { deriveWorkInProgress, type WorkRow } from './workInProgress'

function rowPath(row: WorkRow, workspaceSlug: string): string {
  return workspacePath(workspaceSlug, row.kind === 'plan' ? `/plans/${row.id}` : `/tasks/${row.id}`)
}

function WorkRowItem({ row, workspaceSlug }: { row: WorkRow; workspaceSlug?: string | null }) {
  const { t } = useT()
  const Icon = row.kind === 'plan' ? ClipboardList : ListChecks
  const content = (
    <>
      <Icon className="w-3 h-3 shrink-0 text-gray-500" aria-label={t(`chatA-activity.work.kind.${row.kind}`)} />
      <span className="flex-1 min-w-0">
        <span className="block truncate text-xs text-gray-300" title={row.title}>
          {row.title}
        </span>
        {row.steps?.current && (
          <span className="block truncate text-[10px] text-gray-500" title={row.steps.current}>
            {row.steps.current}
          </span>
        )}
      </span>
      {row.steps && (
        <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
          {t('chatA-activity.work.steps', { done: row.steps.done, total: row.steps.total })}
        </span>
      )}
      <StatusText kind={row.kind} status={row.status} icon className="shrink-0 text-[10px]" />
    </>
  )
  const layout = `flex min-h-6 items-center gap-2 py-1.5 pr-2.5 ${row.nested ? 'pl-6' : 'pl-2.5'}`
  return (
    <li data-kind={row.kind} data-status={row.status}>
      {workspaceSlug ? (
        <Link
          to={rowPath(row, workspaceSlug)}
          aria-label={t(row.kind === 'plan' ? 'chatA-activity.work.openPlan' : 'chatA-activity.work.openTask', { title: row.title })}
          className={`${layout} hover:bg-white/[0.04] transition-colors ${focusRingInset}`}
        >
          {content}
        </Link>
      ) : (
        <div className={layout}>{content}</div>
      )}
    </li>
  )
}

export const WorkBar = memo(function WorkBar({ work, workspaceSlug }: { work?: TimelineWork; workspaceSlug?: string | null }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const summary = useMemo(() => deriveWorkInProgress(work), [work])
  if (!summary) return null

  const counts = [
    summary.planCount > 0 && t(summary.planCount === 1 ? 'chatA-activity.work.plans.one' : 'chatA-activity.work.plans.many', { count: summary.planCount }),
    summary.taskCount > 0 && t(summary.taskCount === 1 ? 'chatA-activity.work.tasks.one' : 'chatA-activity.work.tasks.many', { count: summary.taskCount }),
  ].filter((c): c is string => !!c).join(', ')
  const current = summary.current
  const aria = current
    ? t('chatA-activity.work.barAriaCurrent', { summary: counts, title: current.title })
    : t('chatA-activity.work.barAria', { summary: counts })

  return (
    <div data-testid="work-bar">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={aria}
        className={`flex min-h-6 w-full items-center gap-2.5 px-2.5 py-1 text-[11px] text-gray-400 hover:bg-white/[0.03] transition-colors ${focusRingInset}`}
      >
        <ListChecks className="w-3 h-3 shrink-0 text-indigo-300" aria-hidden />
        <span className="shrink-0 whitespace-nowrap">{counts}</span>
        {current && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap">
            <span className="text-gray-600" aria-hidden>·</span>
            <span className="min-w-0 truncate text-gray-300" title={current.title}>{current.title}</span>
            {current.steps && (
              <span className="shrink-0 tabular-nums text-gray-500">
                {t('chatA-activity.work.steps', { done: current.steps.done, total: current.steps.total })}
              </span>
            )}
          </span>
        )}
        <ChevronDown className={`ml-auto w-3 h-3 shrink-0 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {expanded && (
        <ul className="max-h-40 overflow-y-auto border-t border-white/[0.06] divide-y divide-white/[0.04]">
          {summary.rows.map((row) => (
            <WorkRowItem key={`${row.kind}:${row.id}`} row={row} workspaceSlug={workspaceSlug} />
          ))}
        </ul>
      )}
    </div>
  )
})
