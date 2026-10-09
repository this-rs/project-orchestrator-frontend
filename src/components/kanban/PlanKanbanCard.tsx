import type { ReactNode } from 'react'
import type { Translator } from '@/i18n/translate'
import type { Plan, PlanStatus } from '@/types'
import { FolderKanban } from 'lucide-react'
import { PriorityText, RelativeTime, StatusMenu } from '@/components/ui'
import { BoardCard, BoardCardOverlay } from './BoardCard'
import { useT } from '@/i18n'

function planMeta(plan: Plan, t: Translator['t'], status?: ReactNode): ReactNode[] {
  return [
    status,
    <PriorityText key="p" priority={plan.priority} />,
    plan.created_by ? (
      <span key="by" className="truncate max-w-[8rem]" title={t('kanban.card.createdBy', { name: plan.created_by })}>
        {plan.created_by}
      </span>
    ) : null,
    plan.project_id ? (
      <span key="proj" className="inline-flex items-center gap-1">
        <FolderKanban className="w-3 h-3" aria-hidden="true" />
        {t('kanban.card.project')}
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
  const { t } = useT()
  return (
    <BoardCard
      id={plan.id}
      entityRef={{ kind: 'plan', id: plan.id, label: plan.title }}
      dataKey="plan"
      item={plan}
      ariaLabel={plan.title}
      title={plan.title}
      description={plan.description}
      meta={planMeta(plan, t, onStatusChange ? <StatusMenu key="s" kind="plan" status={plan.status} onChange={onStatusChange} /> : null)}
    />
  )
}

/** Card rendered in the DragOverlay (no drag listeners) */
export function PlanKanbanCardOverlay({ plan }: { plan: Plan }) {
  const { t } = useT()
  return <BoardCardOverlay title={plan.title} description={plan.description} meta={planMeta(plan, t)} />
}
