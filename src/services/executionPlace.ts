import { api } from './api'

/** A pending placement, as `GET /api/execution-places/{id}` or `GET /api/execution-places?status=pending` answers it. */
export interface ExecutionPlaceView {
  placement_id: string
  path: string
  owner?: string
  requested_by?: string
  task_id?: string
  plan_id?: string
  expires_at?: string | null
}

/**
 * The routes that answer « exécute dans X ? ». The reply comes from a PERSON: the server refuses an
 * agent token, another owner, or a path that is not exactly the placement's. This client records
 * nothing — the server's `place_confirmation` is the only store of consent.
 */
export const executionPlaceApi = {
  get: (placementId: string, signal?: AbortSignal) =>
    api.get<ExecutionPlaceView>(`/execution-places/${encodeURIComponent(placementId)}`, signal),
  /** `path` is sent exactly as the harness announced it. */
  confirm: (placementId: string, path: string) =>
    api.post<unknown>(`/execution-places/${encodeURIComponent(placementId)}/confirm`, { path }),
  reject: (placementId: string) =>
    api.post<unknown>(`/execution-places/${encodeURIComponent(placementId)}/reject`),
  /** Pending placements for the calling person. The server filters by owner; an agent token gets 403. */
  listPending: (signal?: AbortSignal) =>
    api.get<ExecutionPlaceView[]>('/execution-places?status=pending', signal),
}
