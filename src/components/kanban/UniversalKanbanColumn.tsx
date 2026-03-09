import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useInfiniteScroll } from '@/hooks'
import { kanbanColorMap } from './KanbanColumn'
import { Spinner } from '@/components/ui/Spinner'

interface UniversalKanbanColumnProps<T extends { id: string }> {
  id: string
  title: string
  items: T[]
  color: string
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  loading?: boolean
  emptyLabel?: string
  fullWidth?: boolean
  children: (item: T) => ReactNode
}

export function UniversalKanbanColumn<T extends { id: string }>({
  id,
  title,
  items,
  color,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  emptyLabel = 'No items',
  fullWidth = false,
  children,
}: UniversalKanbanColumnProps<T>) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const colors = kanbanColorMap[color] || kanbanColorMap.gray

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    loading: loadingMore || loading,
  })

  const displayCount = total !== undefined ? total : items.length

  return (
    <div className={`flex flex-col flex-1 ${fullWidth ? 'min-w-0' : 'min-w-[200px]'}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${colors.bg} border-l-4 ${colors.border}`}>
        <h3 className={`text-sm font-semibold ${colors.text}`}>{title}</h3>
        <span className="text-xs text-gray-500 bg-surface-raised rounded-full px-2 py-0.5">
          {displayCount}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 rounded-b-lg border border-t-0 border-border-subtle min-h-[200px] ${fullWidth ? 'max-h-[calc(100dvh-200px)]' : 'max-h-[calc(100vh-280px)]'} overflow-y-auto transition-colors duration-150 ${
          isOver ? colors.dropHighlight : 'bg-surface-raised/30'
        }`}
      >
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/[0.06] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-600">
            {emptyLabel}
          </div>
        ) : (
          <>
            {items.map((item) => children(item))}
            {/* Sentinel for infinite scroll */}
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
