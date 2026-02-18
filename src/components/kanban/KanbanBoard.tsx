import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { TaskStatus, PaginatedResponse } from '@/types'
import { useKanbanColumnData, useIsMobile } from '@/hooks'
import type { ColumnData } from '@/hooks'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCardOverlay } from './KanbanCard'
import type { KanbanTask } from './KanbanCard'

interface KanbanBoardProps {
  fetchFn: (params: Record<string, unknown>) => Promise<PaginatedResponse<KanbanTask>>
  filters?: Record<string, unknown>
  hiddenStatuses?: TaskStatus[]
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>
  onTaskClick?: (taskId: string) => void
  refreshTrigger?: number
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'pending', title: 'Pending', color: 'gray' },
  { id: 'in_progress', title: 'In Progress', color: 'blue' },
  { id: 'blocked', title: 'Blocked', color: 'yellow' },
  { id: 'completed', title: 'Completed', color: 'green' },
  { id: 'failed', title: 'Failed', color: 'red' },
]

export function KanbanBoard({ fetchFn, filters = {}, hiddenStatuses = [], onTaskStatusChange, onTaskClick, refreshTrigger = 0 }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null)
  const isMobile = useIsMobile()
  const visibleColumns = columns.filter((col) => !hiddenStatuses.includes(col.id))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const pendingCol = useKanbanColumnData<KanbanTask>({ status: 'pending', fetchFn, filters, enabled: !hiddenStatuses.includes('pending'), refreshTrigger })
  const inProgressCol = useKanbanColumnData<KanbanTask>({ status: 'in_progress', fetchFn, filters, enabled: !hiddenStatuses.includes('in_progress'), refreshTrigger })
  const blockedCol = useKanbanColumnData<KanbanTask>({ status: 'blocked', fetchFn, filters, enabled: !hiddenStatuses.includes('blocked'), refreshTrigger })
  const completedCol = useKanbanColumnData<KanbanTask>({ status: 'completed', fetchFn, filters, enabled: !hiddenStatuses.includes('completed'), refreshTrigger })
  const failedCol = useKanbanColumnData<KanbanTask>({ status: 'failed', fetchFn, filters, enabled: !hiddenStatuses.includes('failed'), refreshTrigger })

  const columnDataMap: Record<TaskStatus, ColumnData<KanbanTask>> = {
    pending: pendingCol,
    in_progress: inProgressCol,
    blocked: blockedCol,
    completed: completedCol,
    failed: failedCol,
  }

  // Keep a ref to column data for drag handlers (avoid stale closures)
  const columnDataRef = useRef(columnDataMap)
  useEffect(() => { columnDataRef.current = columnDataMap })

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = (event.active.data.current as { task: KanbanTask } | undefined)?.task
    if (task) setActiveTask(task)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedTask = activeTask
      setActiveTask(null)
      const { active, over } = event
      if (!over || !draggedTask) return

      const taskId = active.id as string
      const newStatus = over.id as TaskStatus
      const oldStatus = draggedTask.status

      if (oldStatus === newStatus) return

      const cols = columnDataRef.current

      // Optimistic: remove from source, add to destination
      cols[oldStatus].removeItem(taskId)
      cols[newStatus].addItem({ ...draggedTask, status: newStatus })

      try {
        await onTaskStatusChange(taskId, newStatus)
      } catch (error) {
        // Rollback: remove from destination, add back to source
        cols[newStatus].removeItem(taskId)
        cols[oldStatus].addItem(draggedTask)
        console.error('Failed to update task status:', error)
      }
    },
    [activeTask, onTaskStatusChange],
  )

  if (isMobile) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.id]
          return (
            <div key={col.id} className="w-[80vw] shrink-0 snap-start">
              <KanbanColumn
                id={col.id}
                title={col.title}
                tasks={data.items}
                color={col.color}
                total={data.total}
                hasMore={data.hasMore}
                loadingMore={data.loadingMore}
                onLoadMore={data.loadMore}
                loading={data.loading}
                onTaskClick={onTaskClick}
                fullWidth
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div data-tour="kanban-columns" className="flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.id]
          return (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={data.items}
              color={col.color}
              total={data.total}
              hasMore={data.hasMore}
              loadingMore={data.loadingMore}
              onLoadMore={data.loadMore}
              loading={data.loading}
              onTaskClick={onTaskClick}
            />
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
