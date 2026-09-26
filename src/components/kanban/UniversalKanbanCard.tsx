import type { ReactNode } from 'react'

interface UniversalKanbanCardProps {
  id: string
  children: ReactNode
  onClick?: () => void
}

/**
 * Click wrapper around a kanban card (opens the item). No entrance / layout
 * animation: cards are live data that re-render on every refetch or
 * websocket event (DESIGN.md "Mouvement" — no list entrance motion).
 * Inner controls (StatusMenu) stop propagation, so they never open the item.
 */
export function UniversalKanbanCard({ id, children, onClick }: UniversalKanbanCardProps) {
  return (
    <div data-card-id={id} onClick={onClick}>
      {children}
    </div>
  )
}
