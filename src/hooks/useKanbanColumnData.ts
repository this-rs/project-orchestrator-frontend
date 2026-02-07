import { useState, useEffect, useCallback, useRef } from 'react'
import type { PaginatedResponse } from '@/types'

export interface ColumnData<T> {
  items: T[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  addItem: (item: T) => void
  removeItem: (id: string) => void
  updateItem: (id: string, updates: Partial<T>) => void
}

interface UseKanbanColumnDataOptions<T> {
  status: string
  fetchFn: (params: Record<string, unknown>) => Promise<PaginatedResponse<T>>
  pageSize?: number
  filters?: Record<string, unknown>
  enabled?: boolean
  getId?: (item: T) => string
  refreshTrigger?: number
}

export function useKanbanColumnData<T>({
  status,
  fetchFn,
  pageSize = 20,
  filters = {},
  enabled = true,
  getId = (item: T) => (item as { id: string }).id,
  refreshTrigger = 0,
}: UseKanbanColumnDataOptions<T>): ColumnData<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)
  const fetchingRef = useRef(false)

  // Serialize filters for dependency tracking
  const filtersKey = JSON.stringify(filters)

  // Initial fetch + refetch when filters change
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    offsetRef.current = 0

    async function fetchInitial() {
      setLoading(true)
      fetchingRef.current = true
      try {
        const parsedFilters = JSON.parse(filtersKey)
        const response = await fetchFn({
          ...parsedFilters,
          status,
          limit: pageSize,
          offset: 0,
        })
        if (cancelled) return
        setItems(response.items || [])
        setTotal(response.total || 0)
        offsetRef.current = (response.items || []).length
      } catch (error) {
        if (!cancelled) console.error(`Failed to fetch column ${status}:`, error)
      } finally {
        if (!cancelled) {
          setLoading(false)
          fetchingRef.current = false
        }
      }
    }

    fetchInitial()
    return () => { cancelled = true }
  }, [status, fetchFn, pageSize, filtersKey, enabled, refreshTrigger])

  const hasMore = items.length < total

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMore) return
    fetchingRef.current = true
    setLoadingMore(true)
    try {
      const parsedFilters = JSON.parse(filtersKey)
      const response = await fetchFn({
        ...parsedFilters,
        status,
        limit: pageSize,
        offset: offsetRef.current,
      })
      setItems((prev) => [...prev, ...(response.items || [])])
      setTotal(response.total || 0)
      offsetRef.current += (response.items || []).length
    } catch (error) {
      console.error(`Failed to load more for column ${status}:`, error)
    } finally {
      setLoadingMore(false)
      fetchingRef.current = false
    }
  }, [status, fetchFn, pageSize, filtersKey, hasMore])

  const addItem = useCallback((item: T) => {
    setItems((prev) => [item, ...prev])
    setTotal((prev) => prev + 1)
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => getId(item) !== id))
    setTotal((prev) => Math.max(0, prev - 1))
  }, [getId])

  const updateItem = useCallback((id: string, updates: Partial<T>) => {
    setItems((prev) => prev.map((item) => getId(item) === id ? { ...item, ...updates } : item))
  }, [getId])

  return {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    addItem,
    removeItem,
    updateItem,
  }
}
