/**
 * Activity Hub filter atoms — Jotai state for the `/activity` page sidebar.
 *
 * Filters control the live `useActivityStream` subscription (project, entity
 * type, status, time window) and the client-side derived view of the runs
 * Map. Atoms that persist UI preferences across sessions use `atomWithStorage`
 * (localStorage); the ephemeral ones — like `selectedProjectId` — stay in
 * volatile atoms because the URL / workspace selection is the source of truth.
 *
 * Wire mapping
 * - `selectedProjectId` → `ActivityFilters.project_id` (REST + WS query)
 * - `selectedEntityTypes` → `ActivityFilters.entity_types` (CSV on the wire)
 * - `selectedStatuses` → `ActivityFilters.statuses` (CSV on the wire)
 * - `timeRange` → client-side filter (the snapshot endpoint is always "now")
 *
 * The atoms are exported individually + a derived `activityFiltersAtom` that
 * assembles them into the shape the hook expects. Use that derived atom in
 * the page; mutate the individual atoms from the sidebar UI.
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { ActivityFilters } from '@/types'

// ---------------------------------------------------------------------------
// Entity type / status enums — frontend-only superset of what the backend
// accepts. The backend uses `EntityType` (`plan_run`, `protocol_run`,
// `chat_session`, …) for snapshot filtering; we expose the "user-facing"
// names ("plan", "protocol", "chat") and map them when serializing.
// ---------------------------------------------------------------------------

export type ActivityEntityKind = 'plan' | 'protocol' | 'chat'

export type ActivityStatusFilter =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget_exceeded'

export const ALL_ENTITY_KINDS: ActivityEntityKind[] = ['plan', 'protocol', 'chat']

export const ALL_STATUSES: ActivityStatusFilter[] = [
  'running',
  'completed',
  'failed',
  'cancelled',
  'budget_exceeded',
]

/** Time-range options — applied client-side against `RunState.started_at`. */
export type ActivityTimeRange = 'all' | '1h' | '24h' | '7d' | '30d'

export const ALL_TIME_RANGES: ActivityTimeRange[] = ['all', '1h', '24h', '7d', '30d']

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

/**
 * Project ID the Live Activity Hub is currently scoped to.
 *
 * Not persisted: the workspace/projects sidebar is the source of truth for the
 * active project, and the Activity page wires the URL `?project=<id>` query
 * param (or a fallback dropdown) into this atom.
 */
export const selectedProjectIdAtom = atom<string | null>(null)

/**
 * Entity types currently visible in the runs grid. Empty = all visible.
 *
 * Persisted in localStorage because users often pin a single kind (e.g. only
 * "plan" runs) and reopen the page expecting the same view.
 */
export const selectedEntityTypesAtom = atomWithStorage<ActivityEntityKind[]>(
  'activity:filter:entityTypes',
  [],
)

/**
 * Statuses currently visible. Empty = all visible (default behaviour).
 *
 * Persisted in localStorage with the default `['running']` so the page lands
 * focused on live activity, matching the user's mental model of the hub.
 */
export const selectedStatusesAtom = atomWithStorage<ActivityStatusFilter[]>(
  'activity:filter:statuses',
  ['running'],
)

/**
 * Time window — restricts the runs grid to entries started within the window.
 *
 * Persisted: defaults to `'24h'` so first-time users see today's activity.
 */
export const timeRangeAtom = atomWithStorage<ActivityTimeRange>(
  'activity:filter:timeRange',
  '24h',
)

/**
 * Whether the sidebar is collapsed (icon-only). Persisted to localStorage.
 */
export const activitySidebarCollapsedAtom = atomWithStorage<boolean>(
  'activity:sidebar:collapsed',
  false,
)

// ---------------------------------------------------------------------------
// Derived atom — `ActivityFilters` payload for the stream hook
// ---------------------------------------------------------------------------

/**
 * Map the user-facing entity kind to the wire `EntityType` enum the backend
 * accepts on `?entity_types=` (snake_case, plural-less).
 */
function entityKindToWire(kind: ActivityEntityKind): string {
  switch (kind) {
    case 'plan':
      return 'plan_run'
    case 'protocol':
      return 'protocol_run'
    case 'chat':
      return 'chat_session'
    default:
      return kind
  }
}

/**
 * Derived `ActivityFilters` ready to be passed to `useActivityStream(filters)`.
 *
 * Returns `null` when no project is selected — the hook resets gracefully in
 * that case (no fetch, no subscription).
 */
export const activityFiltersAtom = atom<ActivityFilters | null>((get) => {
  const projectId = get(selectedProjectIdAtom)
  if (!projectId) return null
  const kinds = get(selectedEntityTypesAtom)
  const statuses = get(selectedStatusesAtom)
  return {
    project_id: projectId,
    entity_types: kinds.length > 0 ? kinds.map(entityKindToWire) : undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    chat_limit: 50,
  }
})

// ---------------------------------------------------------------------------
// Helpers — pure functions used by the page to filter the runs Map locally.
// Keeping them here so atom + filter logic stay co-located.
// ---------------------------------------------------------------------------

/**
 * Return the cutoff timestamp (ms since epoch) for a given time range, or
 * `null` when `'all'` (no cutoff).
 */
export function timeRangeCutoffMs(range: ActivityTimeRange, now: number = Date.now()): number | null {
  switch (range) {
    case '1h':
      return now - 60 * 60 * 1000
    case '24h':
      return now - 24 * 60 * 60 * 1000
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000
    case 'all':
    default:
      return null
  }
}

/** Human label for a `TimeRange` value — used by the sidebar UI. */
export function timeRangeLabel(range: ActivityTimeRange): string {
  switch (range) {
    case '1h':
      return 'Last hour'
    case '24h':
      return 'Last 24h'
    case '7d':
      return 'Last 7 days'
    case '30d':
      return 'Last 30 days'
    case 'all':
    default:
      return 'All time'
  }
}

/** Human label for an entity kind — used by the sidebar UI. */
export function entityKindLabel(kind: ActivityEntityKind): string {
  switch (kind) {
    case 'plan':
      return 'Plan runs'
    case 'protocol':
      return 'Protocol runs'
    case 'chat':
      return 'Chat sessions'
    default:
      return kind
  }
}

/** Human label for an activity status — used by the sidebar UI. */
export function statusLabel(status: ActivityStatusFilter): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'budget_exceeded':
      return 'Budget exceeded'
    default:
      return status
  }
}
