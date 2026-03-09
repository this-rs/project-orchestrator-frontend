import { Circle, Play, CheckCircle2, SkipForward } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Step } from '@/types'
import type { KanbanConfig, KanbanColumnDef } from './types'

/** Step with id and status guaranteed (Step already has these) */
type KanbanStep = Step & { id: string; status: string }

export const stepColumns: KanbanColumnDef[] = [
  { status: 'pending', label: 'Pending', color: 'gray', icon: Circle },
  { status: 'in_progress', label: 'In Progress', color: 'blue', icon: Play },
  { status: 'completed', label: 'Completed', color: 'green', icon: CheckCircle2 },
  { status: 'skipped', label: 'Skipped', color: 'yellow', icon: SkipForward },
]

function StepKanbanCard({ step }: { step: KanbanStep }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: step.id,
    data: { item: step },
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
      className={`rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all duration-150 select-none ${
        isDragging
          ? 'opacity-50 rotate-2 shadow-xl border-indigo-500 bg-surface-raised'
          : 'border-border-subtle bg-surface-raised hover:border-indigo-500 hover:shadow-lg'
      }`}
    >
      <p className="text-sm text-gray-200 line-clamp-3">{step.description}</p>
      {step.verification && (
        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
          Verify: {step.verification}
        </p>
      )}
      <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-500">
        <span>#{step.order}</span>
      </div>
    </div>
  )
}

function StepKanbanCardOverlay({ step }: { step: KanbanStep }) {
  return (
    <div className="rounded-lg border border-indigo-500 bg-surface-raised p-3 shadow-2xl rotate-2 w-[244px] opacity-90">
      <p className="text-sm text-gray-200 line-clamp-3">{step.description}</p>
      {step.verification && (
        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
          Verify: {step.verification}
        </p>
      )}
    </div>
  )
}

/**
 * Creates a step kanban config. Requires fetchFn and onStatusChange
 * to be provided at call site since they depend on runtime context.
 */
export function createStepKanbanConfig(
  overrides: Pick<KanbanConfig<KanbanStep>, 'fetchFn' | 'onStatusChange'> &
    Partial<KanbanConfig<KanbanStep>>,
): KanbanConfig<KanbanStep> {
  return {
    entityType: 'step',
    columns: stepColumns,
    renderCard: (item) => <StepKanbanCard step={item} />,
    renderOverlayCard: (item) => <StepKanbanCardOverlay step={item} />,
    crudEventType: 'step',
    emptyLabel: 'No steps',
    dataKey: 'item',
    ...overrides,
  }
}
