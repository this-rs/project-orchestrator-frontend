import { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { Plan, PlanStatus, PaginatedResponse } from '@/types'
import { useKanbanColumnData, useInfiniteScroll } from '@/hooks'
import type { ColumnData } from '@/hooks'
import { kanbanColorMap } from './KanbanColumn'
import { PlanKanbanCard, PlanKanbanCardOverlay } from './PlanKanbanCard'
import { Spinner } from '@/components/ui/Spinner'

interface PlanKanbanBoardProps {
  fetchFn: (params: Record<string, unknown>) => Promise<PaginatedResponse<Plan>>
  filters?: Record<string, unknown>
  hiddenStatuses?: PlanStatus[]
  onPlanStatusChange: (planId: string, newStatus: PlanStatus) => Promise<void>
  onPlanClick?: (planId: string) => void
}

const columns: { id: PlanStatus; title: string; color: string }[] = [
  { id: 'draft', title: 'Draft', color: 'gray' },
  { id: 'approved', title: 'Approved', color: 'blue' },
  { id: 'in_progress', title: 'In Progress', color: 'yellow' },
  { id: 'completed', title: 'Completed', color: 'green' },
  { id: 'cancelled', title: 'Cancelled', color: 'red' },
]

export function PlanKanbanBoard({ fetchFn, filters = {}, hiddenStatuses = [], onPlanStatusChange, onPlanClick }: PlanKanbanBoardProps) {
  const [activePlan, setActivePlan] = useState<Plan | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const draftCol = useKanbanColumnData<Plan>({ status: 'draft', fetchFn, filters, enabled: !hiddenStatuses.includes('draft') })
  const approvedCol = useKanbanColumnData<Plan>({ status: 'approved', fetchFn, filters, enabled: !hiddenStatuses.includes('approved') })
  const inProgressCol = useKanbanColumnData<Plan>({ status: 'in_progress', fetchFn, filters, enabled: !hiddenStatuses.includes('in_progress') })
  const completedCol = useKanbanColumnData<Plan>({ status: 'completed', fetchFn, filters, enabled: !hiddenStatuses.includes('completed') })
  const cancelledCol = useKanbanColumnData<Plan>({ status: 'cancelled', fetchFn, filters, enabled: !hiddenStatuses.includes('cancelled') })

  const columnDataMap: Record<PlanStatus, ColumnData<Plan>> = {
    draft: draftCol,
    approved: approvedCol,
    in_progress: inProgressCol,
    completed: completedCol,
    cancelled: cancelledCol,
  }

  const columnDataRef = useRef(columnDataMap)
  columnDataRef.current = columnDataMap

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const plan = (event.active.data.current as { plan: Plan } | undefined)?.plan
    if (plan) setActivePlan(plan)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedPlan = activePlan
      setActivePlan(null)
      const { active, over } = event
      if (!over || !draggedPlan) return

      const planId = active.id as string
      const newStatus = over.id as PlanStatus
      const oldStatus = draggedPlan.status

      if (oldStatus === newStatus) return

      const cols = columnDataRef.current

      // Optimistic update
      cols[oldStatus].removeItem(planId)
      cols[newStatus].addItem({ ...draggedPlan, status: newStatus })

      try {
        await onPlanStatusChange(planId, newStatus)
      } catch (error) {
        // Rollback
        cols[newStatus].removeItem(planId)
        cols[oldStatus].addItem(draggedPlan)
        console.error('Failed to update plan status:', error)
      }
    },
    [activePlan, onPlanStatusChange],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.filter((col) => !hiddenStatuses.includes(col.id)).map((col) => {
          const data = columnDataMap[col.id]
          return (
            <PlanKanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              plans={data.items}
              color={col.color}
              total={data.total}
              hasMore={data.hasMore}
              loadingMore={data.loadingMore}
              onLoadMore={data.loadMore}
              loading={data.loading}
              onPlanClick={onPlanClick}
            />
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePlan ? <PlanKanbanCardOverlay plan={activePlan} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function PlanKanbanColumn({
  id,
  title,
  plans,
  color,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  onPlanClick,
}: {
  id: PlanStatus
  title: string
  plans: Plan[]
  color: string
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  loading?: boolean
  onPlanClick?: (planId: string) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const colors = kanbanColorMap[color] || kanbanColorMap.gray

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    loading: loadingMore || loading,
  })

  const displayCount = total !== undefined ? total : plans.length

  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${colors.bg} border-l-4 ${colors.border}`}>
        <h3 className={`text-sm font-semibold ${colors.text}`}>{title}</h3>
        <span className="text-xs text-gray-500 bg-[#1a1d27] rounded-full px-2 py-0.5">
          {displayCount}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 rounded-b-lg border border-t-0 border-white/[0.06] min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto transition-colors duration-150 ${
          isOver ? colors.dropHighlight : 'bg-[#1a1d27]/30'
        }`}
      >
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/[0.06] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-600">
            No plans
          </div>
        ) : (
          <>
            {plans.map((plan) => (
              <PlanKanbanCard
                key={plan.id}
                plan={plan}
                onClick={() => onPlanClick?.(plan.id)}
              />
            ))}
            {hasMore && <div ref={sentinelRef} className="h-1" />}
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
