import type { ReactNode } from 'react'
import type { WorkspaceMilestone, MilestoneProgress, MilestoneStatus } from '@/types'
import { ProgressLine, StatusMenu, formatDay } from '@/components/ui'
import { BoardCard, BoardCardOverlay } from './BoardCard'

export interface MilestoneWithProgress extends WorkspaceMilestone {
  progress?: MilestoneProgress
  workspace_name?: string
}

function milestoneMeta(milestone: MilestoneWithProgress, status?: ReactNode): ReactNode[] {
  const tags = (milestone.tags || []).filter((t) => !t.startsWith('project:'))
  return [
    status,
    milestone.workspace_name ? (
      <span key="src" className="truncate max-w-[10rem]" title={milestone.workspace_name}>
        {milestone.workspace_name}
      </span>
    ) : null,
    milestone.progress ? (
      <span key="prog" className="tabular-nums" title={`${milestone.progress.completed} of ${milestone.progress.total} tasks completed`}>
        {milestone.progress.completed}/{milestone.progress.total}
      </span>
    ) : null,
    milestone.target_date ? <span key="due">due {formatDay(milestone.target_date)}</span> : null,
    tags.length > 0 ? (
      <span key="tags" className="truncate max-w-[10rem]" title={tags.map((t) => `#${t}`).join(' ')}>
        {tags.slice(0, 2).map((t) => `#${t}`).join(' ')}
        {tags.length > 2 ? ` +${tags.length - 2}` : ''}
      </span>
    ) : null,
  ]
}

function progressFooter(milestone: MilestoneWithProgress) {
  return milestone.progress && milestone.progress.total > 0 ? (
    <ProgressLine value={milestone.progress.percentage} label={`${Math.round(milestone.progress.percentage)}% complete`} />
  ) : undefined
}

interface MilestoneKanbanCardProps {
  milestone: MilestoneWithProgress
  onStatusChange?: (status: MilestoneStatus) => Promise<void>
}

export function MilestoneKanbanCard({ milestone, onStatusChange }: MilestoneKanbanCardProps) {
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
        onStatusChange ? (
          <StatusMenu key="s" kind="milestone" status={milestone.status?.toLowerCase() ?? 'open'} onChange={onStatusChange} />
        ) : null,
      )}
      footer={progressFooter(milestone)}
    />
  )
}

export function MilestoneKanbanCardOverlay({ milestone }: { milestone: MilestoneWithProgress }) {
  return (
    <BoardCardOverlay
      title={milestone.title}
      description={milestone.description}
      meta={milestoneMeta(milestone)}
      footer={progressFooter(milestone)}
    />
  )
}
