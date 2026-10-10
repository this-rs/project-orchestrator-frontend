import type { ReactNode } from 'react'
import type { Translator } from '@/i18n/translate'
import type { WorkspaceMilestone, MilestoneProgress, MilestoneStatus } from '@/types'
import { ProgressLine, StatusMenu, formatDay } from '@/components/ui'
import { BoardCard, BoardCardOverlay } from './BoardCard'
import { useT } from '@/i18n'

export interface MilestoneWithProgress extends WorkspaceMilestone {
  progress?: MilestoneProgress
  workspace_name?: string
}

function milestoneMeta(milestone: MilestoneWithProgress, t: Translator['t'], status?: ReactNode): ReactNode[] {
  const tags = (milestone.tags || []).filter((tag) => !tag.startsWith('project:'))
  return [
    status,
    milestone.workspace_name ? (
      <span key="src" className="truncate max-w-[10rem]" title={milestone.workspace_name}>
        {milestone.workspace_name}
      </span>
    ) : null,
    milestone.progress ? (
      <span key="prog" className="tabular-nums" title={t('kanban.card.tasksCompleted', { completed: milestone.progress.completed, total: milestone.progress.total })}>
        {milestone.progress.completed}/{milestone.progress.total}
      </span>
    ) : null,
    milestone.target_date ? <span key="due">{t('kanban.card.due', { date: formatDay(milestone.target_date) })}</span> : null,
    tags.length > 0 ? (
      <span key="tags" className="truncate max-w-[10rem]" title={tags.map((tag) => `#${tag}`).join(' ')}>
        {tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')}
        {tags.length > 2 ? ` +${tags.length - 2}` : ''}
      </span>
    ) : null,
  ]
}

function progressFooter(milestone: MilestoneWithProgress, t: Translator['t']) {
  return milestone.progress && milestone.progress.total > 0 ? (
    <ProgressLine value={milestone.progress.percentage} label={t('kanban.card.percentComplete', { percent: Math.round(milestone.progress.percentage) })} />
  ) : undefined
}

interface MilestoneKanbanCardProps {
  milestone: MilestoneWithProgress
  onStatusChange?: (status: MilestoneStatus) => Promise<void>
}

export function MilestoneKanbanCard({ milestone, onStatusChange }: MilestoneKanbanCardProps) {
  const { t } = useT()
  return (
    <BoardCard
      id={milestone.id}
      dataKey="milestone"
      item={milestone}
      ariaLabel={milestone.title}
      title={milestone.title}
      description={milestone.description}
      meta={milestoneMeta(
        milestone,
        t,
        onStatusChange ? (
          <StatusMenu key="s" kind="milestone" status={milestone.status?.toLowerCase() ?? 'open'} onChange={onStatusChange} />
        ) : null,
      )}
      footer={progressFooter(milestone, t)}
    />
  )
}

export function MilestoneKanbanCardOverlay({ milestone }: { milestone: MilestoneWithProgress }) {
  const { t } = useT()
  return (
    <BoardCardOverlay
      title={milestone.title}
      description={milestone.description}
      meta={milestoneMeta(milestone, t)}
      footer={progressFooter(milestone, t)}
    />
  )
}
