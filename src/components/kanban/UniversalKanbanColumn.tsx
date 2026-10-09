import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useInfiniteScroll } from '@/hooks'
import { useT } from '@/i18n'
import { Skeleton, Spinner, StatusDot, type StatusKind } from '@/components/ui'

interface UniversalKanbanColumnProps<T extends { id: string }> {
  id: string
  title: string
  items: T[]
  /** Status registry for the header dot tone. */
  kind?: StatusKind
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  loading?: boolean
  emptyLabel?: string
  fullWidth?: boolean
  children: (item: T) => ReactNode
}

/**
 * Board column: `● Status  12` header (status tone dot, like everywhere else)
 * over an opaque surface that scrolls on its own. Drop target highlight uses
 * the indigo accent.
 */
export function UniversalKanbanColumn<T extends { id: string }>({
  id,
  title,
  items,
  kind,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  emptyLabel,
  fullWidth = false,
  children,
}: UniversalKanbanColumnProps<T>) {
  const { t } = useT()
  const { isOver, setNodeRef } = useDroppable({ id })

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    loading: loadingMore || loading,
  })

  const displayCount = total !== undefined ? total : items.length

  return (
    <section
      aria-label={`${title} (${displayCount})`}
      className={`flex flex-col flex-1 rounded-xl border bg-white/[0.02] transition-colors duration-(--duration-instant) ${
        fullWidth ? 'min-w-0' : 'min-w-[220px]'
      } ${isOver ? 'border-indigo-500/40 bg-indigo-500/[0.04]' : 'border-white/[0.06]'}`}
    >
      <h3 className="flex items-center gap-2 px-3 min-h-9 text-xs font-medium text-gray-300">
        <StatusDot kind={kind} status={id} size="md" />
        <span className="truncate">{title}</span>
        <span className="tabular-nums font-normal text-gray-500">{displayCount}</span>
      </h3>

      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-2 space-y-2 min-h-[120px] ${
          fullWidth ? 'max-h-[calc(100dvh-220px)]' : 'max-h-[calc(100vh-280px)]'
        } overflow-y-auto overscroll-contain`}
      >
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-gray-600">{emptyLabel ?? t('kanban.empty.items')}</div>
        ) : (
          <>
            {items.map((item) => children(item))}
            {hasMore && <div ref={sentinelRef} className="h-1" />}
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
