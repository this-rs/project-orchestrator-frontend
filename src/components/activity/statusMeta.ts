/**
 * Status → words and tone, for the run cards and the log.
 *
 * The words come from the existing `activity.status.*` keys (already translated
 * into every language) rather than from a second vocabulary: a plan run that is
 * `completed` and a protocol run that is `completed` must read the same word on
 * screen, and a person who learned "Done" in the conversation bar reads "Done"
 * here too.
 *
 * Anything the backend can report that has no word of its own is folded into the
 * closest one **deliberately**: `budget_exceeded` reads as a failure because that
 * is what it is for the person reading the card, and `interrupted` reads as
 * "Ended" because nobody knows whether the work finished.
 */

/** The subset of `MessageKey` this module produces (kept narrow so `t()` type-checks). */
export type ActivityStatusLabelKey =
  | 'activity.status.running'
  | 'activity.status.queued'
  | 'activity.status.done'
  | 'activity.status.failed'
  | 'activity.status.cancelled'
  | 'activity.status.ended'

/** Mirrors `BadgeVariant` of `components/ui/Badge` (not exported there). */
export type ActivityBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'

export interface ActivityStatusBadge {
  labelKey: ActivityStatusLabelKey
  variant: ActivityBadgeVariant
}

/** Plan run / protocol run / task status → badge. */
export function runStatusBadge(status: string): ActivityStatusBadge {
  switch (status) {
    case 'running':
    case 'spawning':
    case 'verifying':
    case 'in_progress':
      return { labelKey: 'activity.status.running', variant: 'info' }
    case 'pending':
      return { labelKey: 'activity.status.queued', variant: 'default' }
    case 'completed':
    case 'completed_with_errors':
      return { labelKey: 'activity.status.done', variant: 'success' }
    case 'failed':
    case 'budget_exceeded':
      return { labelKey: 'activity.status.failed', variant: 'error' }
    case 'cancelled':
      return { labelKey: 'activity.status.cancelled', variant: 'warning' }
    case 'interrupted':
    case 'ended':
      return { labelKey: 'activity.status.ended', variant: 'default' }
    default:
      return { labelKey: 'activity.status.ended', variant: 'default' }
  }
}

/** Tone of the small dot before an active task's title. */
export function statusDotClass(status: string): string {
  switch (status) {
    case 'running':
    case 'verifying':
      return 'bg-emerald-400'
    case 'spawning':
    case 'pending':
      return 'bg-amber-400'
    case 'failed':
      return 'bg-red-400'
    case 'completed':
      return 'bg-sky-400'
    default:
      return 'bg-gray-500'
  }
}

/** Tone of a conversation's activity dot. */
export function chatActivityDotClass(streaming: boolean, live: boolean): string {
  if (streaming) return 'bg-emerald-400'
  if (live) return 'bg-sky-400'
  return 'bg-gray-500'
}
