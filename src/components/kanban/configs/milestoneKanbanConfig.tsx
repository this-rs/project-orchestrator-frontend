import { Calendar, Play, CheckCircle2 } from 'lucide-react'
import { MilestoneKanbanCard, MilestoneKanbanCardOverlay } from '../MilestoneKanbanCard'
import type { MilestoneWithProgress } from '../MilestoneKanbanCard'
import type { KanbanConfig, KanbanColumnDef } from './types'

export const milestoneColumns: KanbanColumnDef[] = [
  { status: 'planned', label: 'Planned', color: 'gray', icon: Calendar },
  { status: 'open', label: 'Open', color: 'blue' },
  { status: 'in_progress', label: 'In Progress', color: 'yellow', icon: Play },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'closed', label: 'Closed', color: 'purple' },
]

/**
 * Creates a milestone kanban config. Requires fetchFn and onStatusChange
 * to be provided at call site since they depend on runtime context.
 */
export function createMilestoneKanbanConfig(
  overrides: Pick<KanbanConfig<MilestoneWithProgress>, 'fetchFn' | 'onStatusChange'> &
    Partial<KanbanConfig<MilestoneWithProgress>>,
): KanbanConfig<MilestoneWithProgress> {
  return {
    entityType: 'milestone',
    columns: milestoneColumns,
    renderCard: (item, _isDragging) => (
      <MilestoneKanbanCard milestone={item} />
    ),
    renderOverlayCard: (item) => <MilestoneKanbanCardOverlay milestone={item} />,
    crudEventType: 'milestone',
    emptyLabel: 'No milestones',
    dataKey: 'milestone',
    ...overrides,
  }
}
