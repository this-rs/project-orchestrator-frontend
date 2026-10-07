import { api, buildQuery } from './api'
import { toProviderError } from './providers'
import {
  ROUTING_ERROR_CODES,
  toLearningStage,
  toProviderRoutingMode,
  toRoutingScope,
  type RoutingDecision,
  type RoutingDecisionsParams,
  type RoutingErrorCode,
  type RoutingReport,
  type RoutingReportParams,
  type RoutingSettings,
  type RoutingSettingsResponse,
} from '@/types/routing'

/**
 * Cognitive routing — which provider/model PO picks for a session, and how
 * much it is allowed to decide (`types/routing.ts`).
 *
 * Settings live globally (`/chat/routing`) with an optional override per
 * project (`/projects/{slug}/routing`); a GET says which one answered
 * (`scope`). Every mutation needs a HUMAN token server-side: an agent's token
 * gets a 403. A backend without the cognitive router answers 404: callers
 * treat that as "mode primary, stage shadow, nothing to show".
 */
export const routingApi = {
  /** Global settings (`scope: 'global'`, or `'default'` when nothing was ever saved). */
  get: () => api.get<unknown>('/chat/routing').then(normalizeRoutingSettings),
  put: (settings: RoutingSettings) => api.put<unknown>('/chat/routing', settings).then(normalizeRoutingSettings),

  /** Settings in force for a project: its override when it has one, else the global ones (`scope` tells which). */
  getProject: (slug: string) =>
    api.get<unknown>(`/projects/${encodeURIComponent(slug)}/routing`).then(normalizeRoutingSettings),
  putProject: (slug: string, settings: RoutingSettings) =>
    api.put<unknown>(`/projects/${encodeURIComponent(slug)}/routing`, settings).then(normalizeRoutingSettings),
  /** Remove the project override: the project follows the global settings again. */
  deleteProject: (slug: string) => api.delete<void>(`/projects/${encodeURIComponent(slug)}/routing`),

  /** Recorded decisions, newest first — applied or not (shadow decisions are kept too). */
  decisions: (params: RoutingDecisionsParams = {}) =>
    api.get<unknown>(`/chat/routing/decisions${buildQuery(params)}`).then(normalizeRoutingDecisions),

  /** Shadow report: agreement with the real choice and the ESTIMATED cost delta, per class and per arm. */
  report: (params: RoutingReportParams = {}) =>
    api.get<RoutingReport>(`/chat/routing/report${buildQuery(params)}`),
}

/**
 * The 400 code of a refused routing setting (`invalid_routing_mode`,
 * `invalid_learning_stage`, `invalid_routing_weight`), `null` for any other
 * error: the caller then shows the generic message.
 */
export function routingErrorCode(err: unknown): RoutingErrorCode | null {
  const code = toProviderError(err)?.code
  return code && (ROUTING_ERROR_CODES as readonly string[]).includes(code) ? (code as RoutingErrorCode) : null
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)

/**
 * A settings answer, read defensively: an unknown mode or stage falls back to
 * the shipped defaults (`primary` / `shadow`) — the identity behaviour — and
 * the body is otherwise returned as the backend sent it.
 */
export function normalizeRoutingSettings(raw: unknown): RoutingSettingsResponse {
  const r = obj(raw)
  if (!r) throw new Error('GET /api/chat/routing: unexpected response')
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const primary = obj(r.primary)
  return {
    mode: toProviderRoutingMode(r.mode) ?? 'primary',
    stage: toLearningStage(r.stage) ?? 'shadow',
    primary:
      primary && typeof primary.provider === 'string'
        ? {
            provider: primary.provider,
            model: typeof primary.model === 'string' ? primary.model : null,
            alias: typeof primary.alias === 'string' ? primary.alias : null,
          }
        : null,
    exploration_epsilon: num(r.exploration_epsilon, 0),
    cost_weight: num(r.cost_weight, 0),
    latency_weight: num(r.latency_weight, 0),
    demote_after: num(r.demote_after, 0),
    scope: toRoutingScope(r.scope) ?? 'default',
  }
}

/**
 * `GET /api/chat/routing/decisions` answers a bare array today; a paginated
 * `{ decisions, total }` envelope is read the same way so the table does not
 * break the day the backend adds one.
 */
export function normalizeRoutingDecisions(raw: unknown): RoutingDecision[] {
  const list = Array.isArray(raw) ? raw : (obj(raw)?.decisions ?? obj(raw)?.items)
  if (!Array.isArray(list)) return []
  return list.filter((d): d is RoutingDecision => {
    const o = obj(d)
    return !!o && typeof o.id === 'string' && typeof o.provider_id === 'string'
  })
}
