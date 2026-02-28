import { api, buildQuery } from './api'
import type {
  Decision,
  DecisionStatus,
  DecisionAffects,
  DecisionTimelineEntry,
  DecisionSearchHit,
} from '@/types'

export const decisionsApi = {
  // ── Search ────────────────────────────────────────────────────────────

  /** BM25 keyword search — uses `q` param (not `query`) */
  search: (params: { q: string; limit?: number; project_slug?: string; workspace_slug?: string }) =>
    api.get<Decision[]>(`/decisions/search${buildQuery(params)}`),

  /** Semantic vector search — uses `query` param + `project_id` */
  searchSemantic: (params: { query: string; limit?: number; project_id?: string }) =>
    api.get<DecisionSearchHit[]>(`/decisions/search-semantic${buildQuery(params)}`),

  // ── CRUD ──────────────────────────────────────────────────────────────

  get: (decisionId: string) => api.get<Decision>(`/decisions/${decisionId}`),

  /** Update — backend returns 204. Note: `alternatives` is NOT updatable */
  update: (
    decisionId: string,
    data: Partial<{
      description: string
      rationale: string
      chosen_option: string
      status: DecisionStatus
    }>,
  ) => api.patch<void>(`/decisions/${decisionId}`, data),

  /** Delete — returns 204 */
  delete: (decisionId: string) => api.delete<void>(`/decisions/${decisionId}`),

  // ── Affects ───────────────────────────────────────────────────────────

  /** Add an affects relation to a code entity */
  addAffects: (
    decisionId: string,
    data: { entity_type: string; entity_id: string; impact_description?: string },
  ) => api.post<void>(`/decisions/${decisionId}/affects`, data),

  /** List entities affected by this decision — returns raw array */
  listAffects: (decisionId: string) => api.get<DecisionAffects[]>(`/decisions/${decisionId}/affects`),

  /** Remove an affects relation — uses query params (safe for file paths with slashes) */
  removeAffects: (decisionId: string, entityType: string, entityId: string) =>
    api.delete<void>(`/decisions/${decisionId}/affects${buildQuery({ entity_type: entityType, entity_id: entityId })}`),

  /** Get decisions affecting a given entity — returns raw array */
  getAffecting: (params: { entity_type: string; entity_id: string; status?: string }) =>
    api.get<Decision[]>(`/decisions/affecting${buildQuery(params)}`),

  // ── Supersession ──────────────────────────────────────────────────────

  /** Mark newDecisionId as superseding oldDecisionId — returns 204 */
  supersede: (newDecisionId: string, oldDecisionId: string) =>
    api.post<void>(`/decisions/${newDecisionId}/supersedes/${oldDecisionId}`),

  // ── Timeline ──────────────────────────────────────────────────────────

  /** Chronological timeline of decisions — returns raw array */
  getTimeline: (params: { task_id?: string; from?: string; to?: string }) =>
    api.get<DecisionTimelineEntry[]>(`/decisions/timeline${buildQuery(params)}`),
}
