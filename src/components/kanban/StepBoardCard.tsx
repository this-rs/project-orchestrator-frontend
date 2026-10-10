import type { ReactNode } from 'react'
import { StatusMenu } from '@/components/ui'
import { useT } from '@/i18n'
import type { Step, StepStatus } from '@/types'
import { BoardCard, BoardCardOverlay } from './BoardCard'
import type { KanbanCardContext } from './configs/types'

/** Step with id and status guaranteed (Step already has these) */
export type KanbanStep = Step & { id: string; status: string }

function stepMeta(step: KanbanStep, status?: ReactNode): ReactNode[] {
  return [status, <span key="n" className="tabular-nums">#{step.order}</span>]
}

export function StepBoardCard({ item, ctx, overlay }: { item: KanbanStep; ctx?: KanbanCardContext; overlay?: boolean }) {
  const { t } = useT()
  const description = item.verification ? t('kanban.card.verify', { text: item.verification }) : undefined
  if (overlay) return <BoardCardOverlay title={item.description} description={description} meta={stepMeta(item)} />
  return (
    <BoardCard
      id={item.id}
      dataKey="item"
      item={item}
      ariaLabel={item.description}
      title={item.description}
      description={description}
      meta={stepMeta(
        item,
        ctx ? <StatusMenu key="s" kind="step" status={item.status} onChange={(s: StepStatus) => ctx.changeStatus(s)} /> : null,
      )}
    />
  )
}
