import { Loader2 } from 'lucide-react'

interface LoadMoreSentinelProps {
  /** Ref callback from useInfiniteList */
  sentinelRef: (node: HTMLDivElement | null) => void
  /** Whether more items are being loaded */
  loadingMore: boolean
  /** Whether there are more items to load */
  hasMore: boolean
  /** Last page failed: show a retry instead of silently ending the list */
  error?: boolean
  /** Manual fallback: shown as a button so a list never depends on scroll detection alone */
  onLoadMore?: () => void
  /** How many items are still to come (label only) */
  remaining?: number
}

/**
 * Sentinel element that triggers infinite scroll loading, with a visible manual fallback.
 * Shows a subtle spinner while loading and a retry when a page failed.
 */
export function LoadMoreSentinel({
  sentinelRef,
  loadingMore,
  hasMore,
  error = false,
  onLoadMore,
  remaining,
}: LoadMoreSentinelProps) {
  if (!hasMore && !loadingMore) return null

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6">
      {loadingMore ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading more…
        </div>
      ) : (
        onLoadMore && (
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-md px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            {error
              ? 'Could not load more — retry'
              : remaining
                ? `Load ${remaining.toLocaleString()} more`
                : 'Load more'}
          </button>
        )
      )}
    </div>
  )
}
