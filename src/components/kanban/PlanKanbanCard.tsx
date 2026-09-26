import type { ReactNode } from 'react'
import type { Plan, PlanStatus } from '@/types'
import { FolderKanban } from 'lucide-react'
import { PriorityText, RelativeTime, StatusMenu } from '@/components/ui'
import { BoardCard, BoardCardOverlay } from './BoardCard'

function planMeta(plan: Plan, status?: ReactNode): ReactNode[] {
  return [
    status,
    <PriorityText key="p" priority={plan.priority} />,
    plan.created_by ? (
      <span key="by" className="truncate max-w-[8rem]" title={`Created by ${plan.created_by}`}>
        {plan.created_by}
      </span>
    ) : null,
    plan.project_id ? (
      <span key="proj" className="inline-flex items-center gap-1">
        <FolderKanban className="w-3 h-3" aria-hidden="true" />
        project
      </span>
    ) : null,
    <RelativeTime key="c" date={plan.created_at} />,
  ]
}

interface PlanKanbanCardProps {
  plan: Plan
  onStatusChange?: (status: PlanStatus) => Promise<void>
}

export function PlanKanbanCard({ plan, onStatusChange }: PlanKanbanCardProps) {
  return (
    <BoardCard
      id={plan.id}
      dataKey="plan"
      item={plan}
      ariaLabel={plan.title}
      title={plan.title}
      description={plan.description}
      meta={planMeta(plan, onStatusChange ? <StatusMenu key="s" kind="plan" status={plan.status} onChange={onStatusChange} /> : null)}
    />
  )
}

/** Card rendered in the DragOverlay (no drag listeners) */
export function PlanKanbanCardOverlay({ plan }: { plan: Plan }) {
  return <BoardCardOverlay title={plan.title} description={plan.description} meta={planMeta(plan)} />
}
