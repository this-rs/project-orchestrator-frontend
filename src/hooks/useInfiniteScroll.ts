import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  threshold?: number
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  threshold = 100,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const stableLoadMore = useRef(onLoadMore)
  const stableFlags = useRef({ hasMore, loading })
  useEffect(() => {
    stableLoadMore.current = onLoadMore
    stableFlags.current = { hasMore, loading }
  })

  const setSentinelRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    sentinelRef.current = node
    if (!node) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && stableFlags.current.hasMore && !stableFlags.current.loading) {
          stableLoadMore.current()
        }
      },
      { rootMargin: `${threshold}px` },
    )

    observerRef.current.observe(node)
  }, [threshold])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  return { sentinelRef: setSentinelRef }
}
