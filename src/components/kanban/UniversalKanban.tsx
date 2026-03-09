import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
import { AnimatePresence } from 'motion/react'
import { useKanbanColumnData, useIsMobile } from '@/hooks'
import type { ColumnData } from '@/hooks'
import { useCrudEventSync } from '@/hooks/useCrudEventSync'
import { UniversalKanbanCard } from './UniversalKanbanCard'
import { UniversalKanbanColumn } from './UniversalKanbanColumn'
import type { KanbanConfig } from './configs/types'

interface UniversalKanbanProps<T extends { id: string; status: string }> {
  config: KanbanConfig<T>
  filters?: Record<string, unknown>
  hiddenStatuses?: string[]
  onItemClick?: (id: string) => void
  refreshTrigger?: number
}

export function UniversalKanban<T extends { id: string; status: string }>({
  config,
  filters = {},
  hiddenStatuses = [],
  onItemClick,
  refreshTrigger = 0,
}: UniversalKanbanProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null)
  const isMobile = useIsMobile()
  const visibleColumns = useMemo(
    () => config.columns.filter((col) => !hiddenStatuses.includes(col.status)),
    [config.columns, hiddenStatuses],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Create column data hooks for each column defined in config.
  // We call useKanbanColumnData for every column in config.columns (not just visible ones)
  // so that hook call count is stable across renders.
  const allColumnData = config.columns.map((col) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useKanbanColumnData<T>({
      status: col.status,
      fetchFn: config.fetchFn,
      filters,
      enabled: !hiddenStatuses.includes(col.status),
      refreshTrigger,
    }),
  )

  // Build a status -> ColumnData map
  const columnDataMap = useMemo(() => {
    const map: Record<string, ColumnData<T>> = {}
    config.columns.forEach((col, i) => {
      map[col.status] = allColumnData[i]
    })
    return map
    // allColumnData items change identity each render, but their internal state is stable via hooks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.columns, ...allColumnData.map(d => d.items)])

  // Real-time CrudEvent sync
  const { markOptimistic } = useCrudEventSync<T>(config.crudEventType, columnDataMap)

  // Ref to avoid stale closures in drag handlers
  const columnDataRef = useRef(columnDataMap)
  useEffect(() => {
    columnDataRef.current = columnDataMap
  })

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dataKey = config.dataKey || 'item'
    const item = (event.active.data.current as Record<string, T> | undefined)?.[dataKey]
    // Also try generic 'item' key
    const fallback = (event.active.data.current as Record<string, T> | undefined)?.item
    if (item) setActiveItem(item)
    else if (fallback) setActiveItem(fallback)
  }, [config.dataKey])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedItem = activeItem
      setActiveItem(null)
      const { active, over } = event
      if (!over || !draggedItem) return

      const itemId = active.id as string
      const newStatus = over.id as string
      const oldStatus = draggedItem.status

      if (oldStatus === newStatus) return

      const cols = columnDataRef.current

      if (!cols[oldStatus] || !cols[newStatus]) return

      // Mark as optimistic so CrudEvent echo is skipped
      markOptimistic(itemId)

      // Optimistic: remove from source, add to destination
      cols[oldStatus].removeItem(itemId)
      cols[newStatus].addItem({ ...draggedItem, status: newStatus } as T)

      try {
        await config.onStatusChange(itemId, newStatus)
      } catch (error) {
        // Rollback: remove from destination, add back to source
        cols[newStatus].removeItem(itemId)
        cols[oldStatus].addItem(draggedItem)
        console.error(`Failed to update ${config.entityType} status:`, error)
      }
    },
    [activeItem, config, markOptimistic],
  )

  if (isMobile) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.status]
          return (
            <div key={col.status} className="w-[80vw] shrink-0 snap-start">
              <UniversalKanbanColumn
                id={col.status}
                title={col.label}
                items={data.items}
                color={col.color}
                total={data.total}
                hasMore={data.hasMore}
                loadingMore={data.loadingMore}
                onLoadMore={data.loadMore}
                loading={data.loading}
                emptyLabel={config.emptyLabel}
                fullWidth
              >
                {(item) => (
                  <UniversalKanbanCard
                    key={item.id}
                    id={item.id}
                    onClick={() => onItemClick?.(item.id)}
                  >
                    {config.renderCard(item, false)}
                  </UniversalKanbanCard>
                )}
              </UniversalKanbanColumn>
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
      <div className="flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.status]
          return (
            <UniversalKanbanColumn
              key={col.status}
              id={col.status}
              title={col.label}
              items={data.items}
              color={col.color}
              total={data.total}
              hasMore={data.hasMore}
              loadingMore={data.loadingMore}
              onLoadMore={data.loadMore}
              loading={data.loading}
              emptyLabel={config.emptyLabel}
            >
              {(item) => (
                <AnimatePresence mode="popLayout" key={item.id}>
                  <UniversalKanbanCard
                    id={item.id}
                    onClick={() => onItemClick?.(item.id)}
                  >
                    {config.renderCard(item, false)}
                  </UniversalKanbanCard>
                </AnimatePresence>
              )}
            </UniversalKanbanColumn>
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem
          ? config.renderOverlayCard
            ? config.renderOverlayCard(activeItem)
            : config.renderCard(activeItem, true)
          : null}
      </DragOverlay>
    </DndContext>
  )
}
