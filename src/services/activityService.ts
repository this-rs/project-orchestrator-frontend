/**
 * Activity service — typed REST client for the Live Activity Hub.
 *
 * Wraps `GET /api/activity/snapshot?project_id=…&[project_slug]&[chat_limit]`
 * and returns a strongly-typed [`ActivitySnapshot`].
 *
 * The handler reuses the shared `api` client so it benefits from:
 * - automatic Bearer token injection (Authorization header)
 * - HttpOnly refresh-cookie support (`credentials: include`)
 * - startup retry against the embedded Tauri backend
 * - 401 → refresh → retry transparent recovery
 *
 * Used by `useActivityStream(filters)` to hydrate the initial state of the
 * Activity Hub *before* the WebSocket connects, avoiding the "empty screen"
 * problem described in the gotcha note attached to this task.
 */

import { api, buildQuery } from './api'
import type { ActivityFilters, ActivitySnapshot } from '@/types'

/**
 * Fetch the initial Activity Hub snapshot for a project.
 *
 * @param filters Snapshot filters — `project_id` is required.
 * @param signal  Optional AbortSignal to cancel the request (e.g. on unmount).
 * @returns The full snapshot envelope (`plan_runs`, `protocol_runs`,
 *          `chat_sessions`, `last_event_seq`).
 *
 * @example
 * const snap = await getSnapshot({ project_id: '…' })
 * console.log(snap.last_event_seq, snap.plan_runs.length)
 */
export async function getSnapshot(
  filters: ActivityFilters,
  signal?: AbortSignal,
): Promise<ActivitySnapshot> {
  if (!filters.project_id) {
    throw new Error('getSnapshot: project_id is required')
  }

  const query = buildQuery({
    project_id: filters.project_id,
    project_slug: filters.project_slug,
    chat_limit: filters.chat_limit,
  })

  return api.get<ActivitySnapshot>(`/activity/snapshot${query}`, signal)
}

/**
 * Default sentinel value for an empty snapshot. Useful as `useReducer`
 * initial state so the UI doesn't need a separate "loading" branch beyond
 * the explicit `status` flag.
 */
export const EMPTY_ACTIVITY_SNAPSHOT: ActivitySnapshot = {
  plan_runs: [],
  protocol_runs: [],
  chat_sessions: [],
  last_event_seq: 0,
}

/**
 * Re-export filters type so consumers can import a single module:
 *
 *   import { activityApi, type ActivityFilters } from '@/services/activityService'
 */
export type { ActivityFilters } from '@/types'

/**
 * Convenience namespace mirroring the `runnerApi` / `chatApi` shape used
 * elsewhere in the codebase.
 */
export const activityApi = {
  /** See [`getSnapshot`]. */
  getSnapshot,
}
