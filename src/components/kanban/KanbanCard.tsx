import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Task, TaskWithPlan } from '@/types'
import { Badge } from '@/components/ui'

/** KanbanTask is the minimal type the card needs — works with both Task and TaskWithPlan */
export type KanbanTask = Task & { plan_title?: string; plan_id?: string }

interface KanbanCardProps {
  task: KanbanTask
  onClick?: () => void
}

export function KanbanCard({ task, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined

  const tags = task.tags || []
  const isBlocked = task.status === 'blocked'
  const planTitle = (task as TaskWithPlan).plan_title

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging && onClick) {
          e.stopPropagation()
          onClick()
        }
      }}
      className={`rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all duration-150 select-none ${
        isDragging
          ? 'opacity-50 rotate-2 shadow-xl border-indigo-500 bg-[#1a1d27]'
          : isBlocked
            ? 'border-yellow-500/50 bg-[#1a1d27] hover:border-yellow-400'
            : 'border-white/[0.06] bg-[#1a1d27] hover:border-indigo-500 hover:shadow-lg'
      }`}
    >
      {/* Title */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2 flex-1">
          {task.title || (task.description || '').slice(0, 60)}
        </h4>
        {task.priority !== undefined && (
          <span className="text-xs font-bold text-indigo-400 shrink-0">{task.priority}</span>
        )}
      </div>

      {/* Plan badge (only if available) */}
      {planTitle && (
        <div className="text-xs text-gray-500 truncate mb-2">{planTitle}</div>
      )}

      {/* Bottom row: assigned + tags + blocked indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {isBlocked && (
          <span className="text-xs text-yellow-400" title="Blocked">
            <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        )}

        {task.assigned_to && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0" title={task.assigned_to}>
            {task.assigned_to.slice(0, 2).toUpperCase()}
          </span>
        )}

        {tags.slice(0, 3).map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant="default" className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
        {tags.length > 3 && (
          <span className="text-[10px] text-gray-500">+{tags.length - 3}</span>
        )}
      </div>
    </div>
  )
}

/** Card rendered in the DragOverlay (no drag listeners) */
export function KanbanCardOverlay({ task }: { task: KanbanTask }) {
  const tags = task.tags || []
  const planTitle = (task as TaskWithPlan).plan_title

  return (
    <div className="rounded-lg border border-indigo-500 bg-[#1a1d27] p-3 shadow-2xl rotate-2 w-[244px] opacity-90">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2 flex-1">
          {task.title || (task.description || '').slice(0, 60)}
        </h4>
        {task.priority !== undefined && (
          <span className="text-xs font-bold text-indigo-400 shrink-0">{task.priority}</span>
        )}
      </div>
      {planTitle && <div className="text-xs text-gray-500 truncate mb-2">{planTitle}</div>}
      <div className="flex items-center gap-1 flex-wrap">
        {task.assigned_to && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0">
            {task.assigned_to.slice(0, 2).toUpperCase()}
          </span>
        )}
        {tags.slice(0, 3).map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant="default" className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  )
}
