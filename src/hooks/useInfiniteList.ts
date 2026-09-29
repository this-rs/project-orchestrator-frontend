import { useState, useEffect, useRef, useCallback } from 'react'
import type { PaginatedResponse } from '@/types'

const DEFAULT_PAGE_SIZE = 25

interface UseInfiniteListOptions<T, F = Record<string, unknown>> {
  /** Fetch function: receives { limit, offset, ...filters } → PaginatedResponse<T> */
  fetcher: (params: { limit: number; offset: number } & F) => Promise<PaginatedResponse<T>>
  /** Extra params passed to fetcher (filters, search, etc.). Changes reset the list. */
  filters?: F
  /** Items per batch (default: 25) */
  pageSize?: number
  /** IntersectionObserver rootMargin in px (default: 200) */
  threshold?: number
  /** Whether fetching is enabled (default: true). Set false to pause. */
  enabled?: boolean
  /** Extract a unique key from an item for deduplication (default: (item) => (item as any).id) */
  getKey?: (item: T) => string
}

interface UseInfiniteListReturn<T> {
  /** Accumulated items across all fetched pages */
  items: T[]
  /** True on first load (no items yet) */
  loading: boolean
  /** True while fetching the next page (items already present) */
  loadingMore: boolean
  /** Whether there are more items to fetch */
  hasMore: boolean
  /** True when the last page failed to load. Auto-loading pauses until `loadMore` is called. */
  error: boolean
  /** Fetch the next page now (manual fallback + retry after an error) */
  loadMore: () => void
  /** Total count from the API */
  total: number
  /** Ref callback — attach to a sentinel element at the bottom of your list */
  sentinelRef: (node: HTMLDivElement | null) => void
  /** Spread onto <LoadMoreSentinel {...sentinelProps} />: ref, state, retry and remaining count */
  sentinelProps: {
    sentinelRef: (node: HTMLDivElement | null) => void
    loadingMore: boolean
    hasMore: boolean
    error: boolean
    onLoadMore: () => void
    remaining: number
  }
  /** Manually reset and re-fetch from scratch */
  reset: () => void
  /** Replace an item in-place (e.g. after status update) */
  updateItem: (predicate: (item: T) => boolean, updater: (item: T) => T) => void
  /** Remove items matching predicate (e.g. after delete) */
  removeItems: (predicate: (item: T) => boolean) => void
}

export function useInfiniteList<T, F = Record<string, unknown>>(
  options: UseInfiniteListOptions<T, F>,
): UseInfiniteListReturn<T> {
  const {
    fetcher,
    filters,
    pageSize = DEFAULT_PAGE_SIZE,
    threshold = 200,
    enabled = true,
    getKey = (item: T) => (item as Record<string, unknown>).id as string,
  } = options

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(false)

  // Track current offset for next fetch
  const offsetRef = useRef(0)
  // Deduplication: prevent concurrent fetches
  const fetchingRef = useRef(false)
  // Generation counter: invalidates in-flight requests on reset
  const generationRef = useRef(0)

  // Stable ref for filters to use in serialization
  const filtersKey = JSON.stringify(filters ?? {})

  // Core fetch function
  const fetchPage = useCallback(
    async (offset: number, generation: number, isFirstPage: boolean) => {
      if (fetchingRef.current) return
      fetchingRef.current = true

      setError(false)
      if (isFirstPage) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      try {
        const params = {
          limit: pageSize,
          offset,
          ...(filters as F),
        }
        const response = await fetcher(params)

        // Bail if a reset happened while we were fetching
        if (generation !== generationRef.current) return

        const newItems = response.items
        setTotal(response.total)
        setHasMore(offset + newItems.length < response.total)
        offsetRef.current = offset + newItems.length

        if (isFirstPage) {
          setItems(newItems)
        } else {
          setItems((prev) => {
            const existingKeys = new Set(prev.map(getKey))
            const deduped = newItems.filter((item) => !existingKeys.has(getKey(item)))
            return [...prev, ...deduped]
          })
        }
      } catch {
        // Keep `hasMore` so the user can retry; auto-loading pauses via `error`.
        // (Silently dropping `hasMore` made the list look complete after a failed page.)
        if (generation === generationRef.current) {
          setError(true)
        }
      } finally {
        if (generation === generationRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
        fetchingRef.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher, pageSize, filtersKey],
  )

  // Reset when filters change
  useEffect(() => {
    if (!enabled) return
    generationRef.current += 1
    const gen = generationRef.current
    offsetRef.current = 0
    fetchingRef.current = false
    setItems([])
    setHasMore(true)
    setTotal(0)
    setError(false)
    fetchPage(0, gen, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, pageSize, enabled])

  // Manual reset
  const reset = useCallback(() => {
    generationRef.current += 1
    const gen = generationRef.current
    offsetRef.current = 0
    fetchingRef.current = false
    setItems([])
    setHasMore(true)
    setTotal(0)
    setLoading(true)
    fetchPage(0, gen, true)
  }, [fetchPage])

  // Load next page
  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return
    const gen = generationRef.current
    fetchPage(offsetRef.current, gen, false)
  }, [fetchPage, hasMore])

  // --- Intersection Observer (reuses pattern from useInfiniteScroll) ---
  const observerRef = useRef<IntersectionObserver | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const stableFlags = useRef({ hasMore, loading: loading || loadingMore, error })
  useEffect(() => {
    stableFlags.current = { hasMore, loading: loading || loadingMore, error }
  })
  const stableLoadMore = useRef(loadMore)
  useEffect(() => {
    stableLoadMore.current = loadMore
  })

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      nodeRef.current = node
      if (!node) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (
            entry?.isIntersecting &&
            stableFlags.current.hasMore &&
            !stableFlags.current.loading &&
            !stableFlags.current.error
          ) {
            stableLoadMore.current()
          }
        },
        { rootMargin: `${threshold}px` },
      )
      observerRef.current.observe(node)
    },
    [threshold],
  )

  // An IntersectionObserver only reports *changes*. If the sentinel is still in view after a
  // page lands (tall screen, short rows), no event fires and loading stalls. Re-observing after
  // each page forces a fresh notification with the current state.
  useEffect(() => {
    const node = nodeRef.current
    const observer = observerRef.current
    if (!node || !observer || loading || loadingMore || !hasMore || error) return
    observer.unobserve(node)
    observer.observe(node)
  }, [items.length, loading, loadingMore, hasMore, error])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
    }
  }, [])

  // In-place update helper
  const updateItem = useCallback(
    (predicate: (item: T) => boolean, updater: (item: T) => T) => {
      setItems((prev) => prev.map((item) => (predicate(item) ? updater(item) : item)))
    },
    [],
  )

  // Remove helper
  const removeItems = useCallback((predicate: (item: T) => boolean) => {
    setItems((prev) => {
      const next = prev.filter((item) => !predicate(item))
      setTotal((t) => t - (prev.length - next.length))
      return next
    })
  }, [])

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    total,
    sentinelRef,
    sentinelProps: {
      sentinelRef,
      loadingMore,
      hasMore,
      error,
      onLoadMore: loadMore,
      remaining: Math.max(0, total - items.length),
    },
    reset,
    updateItem,
    removeItems,
  }
}
