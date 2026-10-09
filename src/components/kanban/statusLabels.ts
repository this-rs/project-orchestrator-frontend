import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n'

/** Translated name of a work-item status (task, plan, step, milestone share the same words). */
const STATUS_KEYS = {
  pending: 'kanban.status.pending',
  in_progress: 'kanban.status.in_progress',
  blocked: 'kanban.status.blocked',
  completed: 'kanban.status.completed',
  failed: 'kanban.status.failed',
  draft: 'kanban.status.draft',
  approved: 'kanban.status.approved',
  cancelled: 'kanban.status.cancelled',
  skipped: 'kanban.status.skipped',
  planned: 'kanban.status.planned',
  open: 'kanban.status.open',
  closed: 'kanban.status.closed',
} as const satisfies Record<string, MessageKey>

export function statusKey(status: string): MessageKey | undefined {
  return Object.prototype.hasOwnProperty.call(STATUS_KEYS, status) ? STATUS_KEYS[status as keyof typeof STATUS_KEYS] : undefined
}

/** `(status, fallback) => label`: the translated status, or the fallback for a status this table does not know. */
export function useStatusLabel(): (status: string, fallback: string) => string {
  const { t } = useT()
  return (status, fallback) => {
    const key = statusKey(status)
    return key ? t(key) : fallback
  }
}

/** Options of a status Select with translated labels. */
export function translateOptions<V extends string>(
  options: { value: V; label: string }[],
  label: (status: string, fallback: string) => string,
): { value: V; label: string }[] {
  return options.map((o) => ({ value: o.value, label: label(o.value, o.label) }))
}
