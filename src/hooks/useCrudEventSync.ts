import { useEffect, useRef, useCallback } from 'react'
import { getEventBus } from '@/services'
import type { CrudEvent } from '@/types'
import type { ColumnData } from './useKanbanColumnData'

/**
 * Syncs CrudEvents from the EventBus into kanban column data.
 *
 * - On 'created' -> adds item to the appropriate status column
 * - On 'updated' with status change -> moves item between columns
 * - On 'deleted' -> removes item from all columns
 *
 * Debounces by 300ms to avoid flickering from rapid events.
 * Skips items that were already optimistically updated (tracked via a Set).
 */
export function useCrudEventSync<T extends { id: string; status: string }>(
  entityType: string | undefined,
  columnDataMap: Record<string, ColumnData<T>>,
): { markOptimistic: (id: string) => void } {
  const columnDataRef = useRef(columnDataMap)
  useEffect(() => {
    columnDataRef.current = columnDataMap
  })

  // Track IDs that were optimistically updated to skip WebSocket echo
  const optimisticIdsRef = useRef(new Set<string>())
  const pendingEventsRef = useRef<CrudEvent[]>([])
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markOptimistic = useCallback((id: string) => {
    optimisticIdsRef.current.add(id)
    // Auto-clear after 5s to avoid memory leaks
    setTimeout(() => optimisticIdsRef.current.delete(id), 5000)
  }, [])

  const processEvents = useCallback(() => {
    const events = pendingEventsRef.current
    pendingEventsRef.current = []
    const cols = columnDataRef.current

    for (const event of events) {
      const { entity_id, action, payload } = event

      // Skip if this was an optimistic update
      if (optimisticIdsRef.current.has(entity_id)) {
        optimisticIdsRef.current.delete(entity_id)
        continue
      }

      if (action === 'created' && payload) {
        const item = payload as unknown as T
        if (item.status && cols[item.status]) {
          cols[item.status].addItem(item)
        }
      } else if (action === 'updated' && payload) {
        const newStatus = (payload as Record<string, unknown>).status as string | undefined
        if (newStatus && cols[newStatus]) {
          // Remove from all columns (we don't know the old status from the event)
          for (const colKey of Object.keys(cols)) {
            cols[colKey].removeItem(entity_id)
          }
          // Add to new column
          const item = payload as unknown as T
          cols[newStatus].addItem(item)
        }
      } else if (action === 'deleted') {
        // Remove from all columns
        for (const colKey of Object.keys(cols)) {
          cols[colKey].removeItem(entity_id)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!entityType) return

    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== entityType) return

      pendingEventsRef.current.push(event)

      // Debounce processing by 300ms
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        processEvents()
      }, 300)
    })

    return () => {
      off()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [entityType, processEvents])

  return { markOptimistic }
}
