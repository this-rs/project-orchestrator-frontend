import type { ReactNode } from 'react'
import { Circle, Play, CheckCircle2, SkipForward } from 'lucide-react'
import { StatusMenu } from '@/components/ui'
import type { Step, StepStatus } from '@/types'
import { BoardCard, BoardCardOverlay } from '../BoardCard'
import type { KanbanConfig, KanbanColumnDef } from './types'

/** Step with id and status guaranteed (Step already has these) */
type KanbanStep = Step & { id: string; status: string }

export const stepColumns: KanbanColumnDef[] = [
  { status: 'pending', label: 'Pending', color: 'gray', icon: Circle },
  { status: 'in_progress', label: 'In Progress', color: 'blue', icon: Play },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'skipped', label: 'Skipped', color: 'yellow', icon: SkipForward },
]

function stepMeta(step: KanbanStep, status?: ReactNode): ReactNode[] {
  return [status, <span key="n" className="tabular-nums">#{step.order}</span>]
}

/**
 * Creates a step kanban config. Requires fetchFn and onStatusChange
 * to be provided at call site since they depend on runtime context.
 */
export function createStepKanbanConfig(
  overrides: Pick<KanbanConfig<KanbanStep>, 'fetchFn' | 'onStatusChange'> &
    Partial<KanbanConfig<KanbanStep>>,
): KanbanConfig<KanbanStep> {
  return {
    entityType: 'step',
    statusKind: 'step',
    columns: stepColumns,
    renderCard: (item, _isDragging, ctx) => (
      <BoardCard
        id={item.id}
        dataKey="item"
        item={item}
        ariaLabel={item.description}
        title={item.description}
        description={item.verification ? `Verify: ${item.verification}` : undefined}
        meta={stepMeta(
          item,
          ctx ? <StatusMenu key="s" kind="step" status={item.status} onChange={(s: StepStatus) => ctx.changeStatus(s)} /> : null,
        )}
      />
    ),
    renderOverlayCard: (item) => (
      <BoardCardOverlay
        title={item.description}
        description={item.verification ? `Verify: ${item.verification}` : undefined}
        meta={stepMeta(item)}
      />
    ),
    crudEventType: 'step',
    emptyLabel: 'No steps',
    dataKey: 'item',
    ...overrides,
  }
}
