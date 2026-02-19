import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Plan } from '@/types'
import { Badge } from '@/components/ui'

interface PlanKanbanCardProps {
  plan: Plan
  onClick?: () => void
}

export function PlanKanbanCard({ plan, onClick }: PlanKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: plan.id,
    data: { plan },
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined

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
          ? 'opacity-50 rotate-2 shadow-xl border-indigo-500 bg-surface-raised'
          : 'border-border-subtle bg-surface-raised hover:border-indigo-500 hover:shadow-lg'
      }`}
    >
      {/* Title */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2 flex-1">
          {plan.title}
        </h4>
        {plan.priority !== undefined && (
          <span className="text-xs font-bold text-indigo-400 shrink-0">{plan.priority}</span>
        )}
      </div>

      {/* Description preview */}
      {plan.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{plan.description}</p>
      )}

      {/* Bottom: creator */}
      <div className="flex items-center gap-1">
        {plan.created_by && (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0"
            title={plan.created_by}
          >
            {plan.created_by.slice(0, 2).toUpperCase()}
          </span>
        )}
        {plan.project_id && (
          <Badge variant="default" className="text-[10px] px-1.5 py-0">project</Badge>
        )}
      </div>
    </div>
  )
}

/** Card rendered in the DragOverlay (no drag listeners) */
export function PlanKanbanCardOverlay({ plan }: { plan: Plan }) {
  return (
    <div className="rounded-lg border border-indigo-500 bg-surface-raised p-3 shadow-2xl rotate-2 w-[244px] opacity-90">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2 flex-1">
          {plan.title}
        </h4>
        {plan.priority !== undefined && (
          <span className="text-xs font-bold text-indigo-400 shrink-0">{plan.priority}</span>
        )}
      </div>
      {plan.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{plan.description}</p>
      )}
    </div>
  )
}
