import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MetaLine } from '@/components/ui'

interface BoardCardBodyProps {
  title: ReactNode
  /** Muted 2-line preview. */
  description?: ReactNode
  /** One meta line (MetaLine: falsy items skipped). */
  meta?: ReactNode[]
  /** Extra line under the meta (progress…). */
  footer?: ReactNode
}

function BoardCardBody({ title, description, meta, footer }: BoardCardBodyProps) {
  return (
    <>
      <div className="text-sm leading-5 text-gray-200 line-clamp-2 break-words">{title}</div>
      {description && <div className="mt-0.5 text-xs leading-4 text-gray-500 line-clamp-2 break-words">{description}</div>}
      {meta && meta.length > 0 && <MetaLine items={meta} className="mt-1.5" />}
      {footer && <div className="mt-2">{footer}</div>}
    </>
  )
}

interface BoardCardProps extends BoardCardBodyProps {
  id: string
  /** dnd-kit drag data: `{ [dataKey]: item }` (+ `item` for the generic lookup). */
  dataKey: string
  item: unknown
  /** Accessible name of the draggable card. */
  ariaLabel: string
}

/**
 * Kanban card — same visual language as EntityRow (title, muted preview,
 * one meta line), on an opaque raised surface. Draggable with pointer / touch
 * (long-press) / keyboard; status can also be changed from the StatusMenu in
 * the meta line, which is the only way on phones (no drag there).
 */
export function BoardCard({ id, dataKey, item, ariaLabel, ...body }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { [dataKey]: item, item },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={ariaLabel}
      className={`rounded-lg border px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition-colors duration-(--duration-instant) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60 ${
        isDragging ? 'opacity-40 border-indigo-500/60 bg-surface-raised' : 'border-white/[0.06] bg-surface-raised hover:border-white/[0.14]'
      }`}
    >
      <BoardCardBody {...body} />
    </div>
  )
}

/** Card shown in the DragOverlay while dragging (no listeners, lifted look). */
export function BoardCardOverlay(props: BoardCardBodyProps) {
  return (
    <div className="w-[260px] rounded-lg border border-indigo-500/60 bg-surface-raised px-3 py-2.5 shadow-2xl">
      <BoardCardBody {...props} />
    </div>
  )
}
