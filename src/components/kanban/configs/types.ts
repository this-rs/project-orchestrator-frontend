import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PaginatedResponse } from '@/types'
import type { StatusKind } from '@/components/ui'

export interface KanbanColumnDef {
  status: string
  label: string
  /** Legacy colour name — column headers now use the status tone (statusMeta). */
  color: string
  icon?: LucideIcon
}

/** Per-card helpers handed to `renderCard` by UniversalKanban. */
export interface KanbanCardContext {
  /**
   * Move the card to another column — same optimistic path as a drop
   * (used by the card's StatusMenu; the only way to change status on phones).
   */
  changeStatus: (newStatus: string) => Promise<void>
}

export interface KanbanConfig<T extends { id: string; status: string }> {
  entityType: string // 'task' | 'plan' | 'milestone' | 'step'
  /** Status registry used for column headers (dot tone). */
  statusKind?: StatusKind
  columns: KanbanColumnDef[]
  fetchFn: (params: Record<string, unknown>) => Promise<PaginatedResponse<T>>
  onStatusChange: (id: string, newStatus: string) => Promise<void>
  renderCard: (item: T, isDragging: boolean, ctx?: KanbanCardContext) => ReactNode
  renderOverlayCard?: (item: T) => ReactNode
  crudEventType?: string // for WebSocket real-time ('task', 'plan', etc.)
  filters?: Record<string, unknown>
  /** Label used when a column is empty, e.g. "No tasks" */
  emptyLabel?: string
  /** Data key used in dnd-kit drag data to identify the item */
  dataKey?: string
}
