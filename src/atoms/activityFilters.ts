/**
 * User preferences of the Live Activity Hub.
 *
 * Persisted per browser (the hub is a personal cockpit: two people looking at
 * the same instance should not share a filter). The lists are category and
 * status names — the exact wire values the server accepts, so an atom can be
 * handed to `/ws/activity` without a translation table in between.
 */
import { atomWithStorage } from 'jotai/utils'
import type { ActivityCategory } from '@/types/activity'

/**
 * Categories the person wants to see. Empty = all of them.
 *
 * Empty is the default on purpose: a hub that opens on an empty grid because
 * the previous session filtered on "chat sessions" is a hub that looks broken.
 */
export const activityCategoriesAtom = atomWithStorage<ActivityCategory[]>(
  'po-activity-categories',
  [],
  undefined,
  { getOnInit: true },
)

/** Statuses to keep (`running`, `completed`, …). Empty = all. */
export const activityStatusesAtom = atomWithStorage<string[]>(
  'po-activity-statuses',
  [],
  undefined,
  { getOnInit: true },
)

/** Follow the log as events arrive (auto-scroll). */
export const activityFollowLogAtom = atomWithStorage<boolean>(
  'po-activity-follow-log',
  true,
  undefined,
  { getOnInit: true },
)

/**
 * Animate the cards that just received an event.
 *
 * Off means off: the pulse is decoration, and a person on a busy instance may
 * legitimately want the page to hold still.
 */
export const activityPulseAtom = atomWithStorage<boolean>(
  'po-activity-pulse',
  true,
  undefined,
  { getOnInit: true },
)
