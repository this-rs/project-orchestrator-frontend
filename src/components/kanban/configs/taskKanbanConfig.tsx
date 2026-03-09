import { Circle, Play, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
import { KanbanCard, KanbanCardOverlay } from '../KanbanCard'
import type { KanbanTask } from '../KanbanCard'
import type { KanbanConfig, KanbanColumnDef } from './types'

export const taskColumns: KanbanColumnDef[] = [
  { status: 'pending', label: 'Pending', color: 'gray', icon: Circle },
  { status: 'in_progress', label: 'In Progress', color: 'blue', icon: Play },
  { status: 'blocked', label: 'Blocked', color: 'yellow', icon: ShieldAlert },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'failed', label: 'Failed', color: 'red', icon: XCircle },
]

/**
 * Creates a task kanban config. Requires fetchFn and onStatusChange
 * to be provided at call site since they depend on runtime context.
 */
export function createTaskKanbanConfig(
  overrides: Pick<KanbanConfig<KanbanTask>, 'fetchFn' | 'onStatusChange'> &
    Partial<KanbanConfig<KanbanTask>>,
): KanbanConfig<KanbanTask> {
  return {
    entityType: 'task',
    columns: taskColumns,
    renderCard: (item, _isDragging) => (
      <KanbanCard task={item} />
    ),
    renderOverlayCard: (item) => <KanbanCardOverlay task={item} />,
    crudEventType: 'task',
    emptyLabel: 'No tasks',
    dataKey: 'task',
    ...overrides,
  }
}
