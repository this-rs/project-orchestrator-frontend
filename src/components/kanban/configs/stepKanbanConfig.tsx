import { Circle, Play, CheckCircle2, SkipForward } from 'lucide-react'
import { StepBoardCard, type KanbanStep } from '../StepBoardCard'
import type { KanbanConfig, KanbanColumnDef } from './types'

export const stepColumns: KanbanColumnDef[] = [
  { status: 'pending', label: 'Pending', color: 'gray', icon: Circle },
  { status: 'in_progress', label: 'In Progress', color: 'blue', icon: Play },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'skipped', label: 'Skipped', color: 'yellow', icon: SkipForward },
]

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
    renderCard: (item, _isDragging, ctx) => <StepBoardCard item={item} ctx={ctx} />,
    renderOverlayCard: (item) => <StepBoardCard item={item} overlay />,
    crudEventType: 'step',
    emptyLabel: 'No steps',
    dataKey: 'item',
    ...overrides,
  }
}
