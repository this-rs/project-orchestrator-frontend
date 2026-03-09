import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PaginatedResponse } from '@/types'

export interface KanbanColumnDef {
  status: string
  label: string
  color: string // 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple'
  icon?: LucideIcon
}

export interface KanbanConfig<T extends { id: string; status: string }> {
  entityType: string // 'task' | 'plan' | 'milestone' | 'step'
  columns: KanbanColumnDef[]
  fetchFn: (params: Record<string, unknown>) => Promise<PaginatedResponse<T>>
  onStatusChange: (id: string, newStatus: string) => Promise<void>
  renderCard: (item: T, isDragging: boolean) => ReactNode
  renderOverlayCard?: (item: T) => ReactNode
  crudEventType?: string // for WebSocket real-time ('task', 'plan', etc.)
  filters?: Record<string, unknown>
  /** Label used when a column is empty, e.g. "No tasks" */
  emptyLabel?: string
  /** Data key used in dnd-kit drag data to identify the item */
  dataKey?: string
}
