/* eslint-disable react-refresh/only-export-components */
import { useDroppable } from '@dnd-kit/core'
import type { TaskStatus } from '@/types'
import { useInfiniteScroll } from '@/hooks'
import { KanbanCard } from './KanbanCard'
import type { KanbanTask } from './KanbanCard'
import { Spinner } from '@/components/ui/Spinner'

interface KanbanColumnProps {
  id: TaskStatus
  title: string
  tasks: KanbanTask[]
  color: string
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  loading?: boolean
  onTaskClick?: (taskId: string) => void
  fullWidth?: boolean
}

const colorMap: Record<string, { border: string; bg: string; text: string; dropHighlight: string }> = {
  gray: {
    border: 'border-l-gray-500',
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    dropHighlight: 'bg-gray-500/20 border-gray-500/50',
  },
  blue: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    dropHighlight: 'bg-blue-500/20 border-blue-500/50',
  },
  yellow: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    dropHighlight: 'bg-yellow-500/20 border-yellow-500/50',
  },
  green: {
    border: 'border-l-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dropHighlight: 'bg-green-500/20 border-green-500/50',
  },
  red: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dropHighlight: 'bg-red-500/20 border-red-500/50',
  },
  purple: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    dropHighlight: 'bg-purple-500/20 border-purple-500/50',
  },
}

export { colorMap as kanbanColorMap }

export function KanbanColumn({
  id,
  title,
  tasks,
  color,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  onTaskClick,
  fullWidth = false,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const colors = colorMap[color] || colorMap.gray

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    loading: loadingMore || loading,
  })

  const displayCount = total !== undefined ? total : tasks.length

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
        ) : tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-600">
            No tasks
          </div>
        ) : (
          <>
            {tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick?.(task.id)}
              />
            ))}
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
