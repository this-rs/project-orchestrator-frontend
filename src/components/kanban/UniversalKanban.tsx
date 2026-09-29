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

  /**
   * Optimistically move an item to another column, then persist; rollback on
   * error. Shared by drag & drop and the cards' StatusMenu.
   */
  const moveItem = useCallback(
    async (item: T, newStatus: string) => {
      const oldStatus = item.status
      if (oldStatus === newStatus) return
      const cols = columnDataRef.current
      if (!cols[oldStatus] || !cols[newStatus]) {
        // Target column not loaded (hidden) — persist without local move.
        await config.onStatusChange(item.id, newStatus)
        cols[oldStatus]?.removeItem(item.id)
        return
      }

      // Mark as optimistic so CrudEvent echo is skipped
      markOptimistic(item.id)

      // Optimistic: remove from source, add to destination
      cols[oldStatus].removeItem(item.id)
      cols[newStatus].addItem({ ...item, status: newStatus } as T)

      try {
        await config.onStatusChange(item.id, newStatus)
      } catch (error) {
        // Rollback: remove from destination, add back to source
        cols[newStatus].removeItem(item.id)
        cols[oldStatus].addItem(item)
        console.error(`Failed to update ${config.entityType} status:`, error)
      }
    },
    [config, markOptimistic],
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedItem = activeItem
      setActiveItem(null)
      const { over } = event
      if (!over || !draggedItem) return
      const cols = columnDataRef.current
      // Drops outside a known column are ignored
      if (!cols[draggedItem.status] || !cols[over.id as string]) return
      await moveItem(draggedItem, over.id as string)
    },
    [activeItem, moveItem],
  )

  const renderCard = (item: T) =>
    config.renderCard(item, false, { changeStatus: (newStatus) => moveItem(item, newStatus) })

  if (isMobile) {
    return (
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 -mx-4 px-4 scroll-px-4 snap-x snap-mandatory">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.status]
          return (
            <div key={col.status} className="w-[82vw] max-w-[340px] shrink-0 snap-start flex">
              <UniversalKanbanColumn
                id={col.status}
                title={col.label}
                items={data.items}
                kind={config.statusKind}
                total={data.total}
                hasMore={data.hasMore}
                loadingMore={data.loadingMore}
                onLoadMore={data.loadMore}
                loading={data.loading}
                emptyLabel={config.emptyLabel}
                fullWidth
              >
                {(item) => (
                  <UniversalKanbanCard key={item.id} id={item.id} onClick={() => onItemClick?.(item.id)}>
                    {renderCard(item)}
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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visibleColumns.map((col) => {
          const data = columnDataMap[col.status]
          return (
            <UniversalKanbanColumn
              key={col.status}
              id={col.status}
              title={col.label}
              items={data.items}
              kind={config.statusKind}
              total={data.total}
              hasMore={data.hasMore}
              loadingMore={data.loadingMore}
              onLoadMore={data.loadMore}
              loading={data.loading}
              emptyLabel={config.emptyLabel}
            >
              {(item) => (
                <UniversalKanbanCard key={item.id} id={item.id} onClick={() => onItemClick?.(item.id)}>
                  {renderCard(item)}
                </UniversalKanbanCard>
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
