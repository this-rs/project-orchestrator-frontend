import { FileEdit, ThumbsUp, Play, CheckCircle2, Ban } from 'lucide-react'
import { PlanKanbanCard, PlanKanbanCardOverlay } from '../PlanKanbanCard'
import type { Plan } from '@/types'
import type { KanbanConfig, KanbanColumnDef } from './types'

export const planColumns: KanbanColumnDef[] = [
  { status: 'draft', label: 'Draft', color: 'gray', icon: FileEdit },
  { status: 'approved', label: 'Approved', color: 'blue', icon: ThumbsUp },
  { status: 'in_progress', label: 'In Progress', color: 'purple', icon: Play },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'cancelled', label: 'Cancelled', color: 'red', icon: Ban },
]

/**
 * Creates a plan kanban config. Requires fetchFn and onStatusChange
 * to be provided at call site since they depend on runtime context.
 */
export function createPlanKanbanConfig(
  overrides: Pick<KanbanConfig<Plan>, 'fetchFn' | 'onStatusChange'> &
    Partial<KanbanConfig<Plan>>,
): KanbanConfig<Plan> {
  return {
    entityType: 'plan',
    columns: planColumns,
    renderCard: (item, _isDragging) => (
      <PlanKanbanCard plan={item} />
    ),
    renderOverlayCard: (item) => <PlanKanbanCardOverlay plan={item} />,
    crudEventType: 'plan',
    emptyLabel: 'No plans',
    dataKey: 'plan',
    ...overrides,
  }
}
