import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { WorkspaceMilestone, MilestoneProgress } from '@/types'
import { Badge, ProgressBar } from '@/components/ui'

export interface MilestoneWithProgress extends WorkspaceMilestone {
  progress?: MilestoneProgress
  workspace_name?: string
}

interface MilestoneKanbanCardProps {
  milestone: MilestoneWithProgress
  onClick?: () => void
}

export function MilestoneKanbanCard({ milestone, onClick }: MilestoneKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: milestone.id,
    data: { milestone },
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined

  const tags = milestone.tags || []

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
      <h4 className="text-sm font-medium text-gray-100 line-clamp-2 mb-1">
        {milestone.title}
      </h4>

      {milestone.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{milestone.description}</p>
      )}

      {milestone.progress && (
        <div className="mb-2">
          <ProgressBar value={milestone.progress.percentage} size="sm" />
          <p className="text-[10px] text-gray-500 mt-0.5">
            {milestone.progress.completed}/{milestone.progress.total}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {milestone.workspace_name && (
          <span className="text-[10px] text-gray-500">{milestone.workspace_name}</span>
        )}
        {milestone.target_date && (
          <span className="text-[10px] text-gray-500">
            Target: {new Date(milestone.target_date).toLocaleDateString()}
          </span>
        )}
        {tags.slice(0, 2).map((tag, i) => (
          <Badge key={`${tag}-${i}`} variant="default" className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  )
}

export function MilestoneKanbanCardOverlay({ milestone }: { milestone: MilestoneWithProgress }) {
  return (
    <div className="rounded-lg border border-indigo-500 bg-surface-raised p-3 shadow-2xl rotate-2 w-[300px] opacity-90">
      <h4 className="text-sm font-medium text-gray-100 line-clamp-2 mb-1">
        {milestone.title}
      </h4>
      {milestone.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{milestone.description}</p>
      )}
      {milestone.progress && (
        <div className="mt-1">
          <ProgressBar value={milestone.progress.percentage} size="sm" />
        </div>
      )}
    </div>
  )
}
