// ============================================================================
// ROUTING — why a candidate was left out, in words
// ============================================================================
//
// The router's reject reasons are an open list (`RoutingRejection`): a code the
// frontend knows gets its label, an unknown one stays visible as words, never
// hidden. `window_unknown` (backend #649) also says why when the cause is sent.

import type { MessageKey, Vars } from '@/i18n/catalog'
import { ROUTING_REJECTIONS, type KnownRoutingRejection } from '@/types/routing'

const WINDOW_CAUSE_KEYS: Readonly<Record<string, MessageKey>> = {
  catalog_offline: 'routing.rejectionWindow.catalog_offline',
  not_in_catalog: 'routing.rejectionWindow.not_in_catalog',
}

function isKnown(code: string): code is KnownRoutingRejection {
  return (ROUTING_REJECTIONS as readonly string[]).includes(code)
}

/** Label of a reject reason: its text, its cause for `window_unknown`, or the code as words. */
export function routingRejectionLabel(
  t: (key: MessageKey, vars?: Vars) => string,
  rejected: string,
  why?: string | null,
): string {
  if (rejected === 'window_unknown' && why) {
    const causeKey = WINDOW_CAUSE_KEYS[why]
    if (causeKey) return t(causeKey)
  }
  if (isKnown(rejected)) return t(`routing.rejection.${rejected}`)
  return rejected.replace(/[_-]+/g, ' ').trim()
}
