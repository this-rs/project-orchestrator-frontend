import type { MessageKey } from '@/i18n'
import type { Vars } from '@/i18n/catalog'

/** Statuses that have a label in the `intelGraph.status` group; any other value (a status added by the backend) is shown as received. */
const KNOWN_STATUSES = new Set([
  'active', 'accepted', 'proposed', 'emerging', 'deprecated', 'superseded', 'dormant', 'archived',
  'needs_review', 'stale', 'obsolete', 'imported', 'draft', 'approved', 'in_progress', 'completed',
  'cancelled', 'pending', 'blocked', 'failed', 'skipped', 'planned', 'released',
])

export function statusLabel(t: (key: MessageKey, vars?: Vars) => string, status: string): string {
  return KNOWN_STATUSES.has(status) ? t(`intelGraph.status.${status}` as MessageKey) : status.replace(/_/g, ' ')
}
