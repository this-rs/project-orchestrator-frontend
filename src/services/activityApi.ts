/**
 * REST side of the Live Activity Hub: the initial state of everything running.
 *
 * The live feed (`/ws/activity`) can only describe what happens *after* it is
 * connected. This snapshot is what makes the page useful on first paint, and it
 * is also the reconciliation point after a gap: an indicator driven by events
 * alone shows nothing for work started before the mount, and keeps a card alive
 * forever when the "finished" event was dropped.
 */
import { api, buildQuery } from './api'
import type { ActivitySnapshot } from '@/types/activity'

export interface ActivitySnapshotQuery {
  /** Restrict to one project. Wins over `workspaceSlug`. */
  projectId?: string
  /** Restrict to the projects of one workspace. */
  workspaceSlug?: string
  /** Entries per family (server default 50, capped at 200). */
  limit?: number
}

/** GET /api/activity/snapshot — what is running now, in one request. */
export function fetchActivitySnapshot(
  query: ActivitySnapshotQuery = {},
  signal?: AbortSignal,
): Promise<ActivitySnapshot> {
  const qs = buildQuery({
    project_id: query.projectId,
    workspace_slug: query.workspaceSlug,
    limit: query.limit,
  })
  return api.get<ActivitySnapshot>(`/activity/snapshot${qs}`, signal)
}
