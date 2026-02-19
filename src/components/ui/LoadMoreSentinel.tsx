import { Loader2 } from 'lucide-react'

interface LoadMoreSentinelProps {
  /** Ref callback from useInfiniteList */
  sentinelRef: (node: HTMLDivElement | null) => void
  /** Whether more items are being loaded */
  loadingMore: boolean
  /** Whether there are more items to load */
  hasMore: boolean
}

/**
 * Invisible sentinel element that triggers infinite scroll loading.
 * Shows a subtle spinner when loading more items.
 */
export function LoadMoreSentinel({ sentinelRef, loadingMore, hasMore }: LoadMoreSentinelProps) {
  if (!hasMore && !loadingMore) return null

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6">
      {loadingMore && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading more…
        </div>
      )}
    </div>
  )
}
