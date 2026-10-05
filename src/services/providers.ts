import { api, ApiError, buildQuery } from './api'
import {
  readProviderError,
  type ProviderErrorInfo,
  type ProviderHealth,
  type ProviderId,
  type ProviderModel,
  type ProvidersResponse,
} from '@/types/provider'

/**
 * Provider instances — which agent harnesses this server can open a session on.
 *
 * `GET /chat/providers` is what makes capabilities known BEFORE a session
 * exists (the composer of a new conversation already needs to know whether the
 * chosen model takes images or lets the model be changed).
 *
 * A backend that predates providers answers 404: callers treat that as "one
 * provider, Claude Code" (see `fetchProviders` in `atoms/providers.ts`).
 */
export const providersApi = {
  /** Instances, their health, per-model capabilities, aliases and the resolved default. */
  list: (params: { project_slug?: string } = {}) =>
    api.get<ProvidersResponse>(`/chat/providers${buildQuery(params)}`),

  /** Health of one instance, re-checked now ("re-check" button, auth state, login command). */
  status: (id: ProviderId) =>
    api.get<ProviderHealth>(`/chat/providers/${encodeURIComponent(id)}/status`),

  /** Model catalog of one instance. */
  models: (id: ProviderId) =>
    api.get<ProviderModel[]>(`/chat/providers/${encodeURIComponent(id)}/models`),
}

/**
 * Read a typed provider error out of whatever a call threw.
 *
 * The server answers a provider failure as `{ code, error|message, … }` (`code`
 * is the `kind` of the nexus `ProviderError`) with a status of its choosing; `ApiError.message` carries that raw body. Returns
 * `null` when the error is not a typed provider error — the caller then shows
 * its generic message. Never invents a code from a status alone.
 */
export function toProviderError(err: unknown): ProviderErrorInfo | null {
  let body: unknown = err
  let status: number | undefined
  if (err instanceof ApiError) {
    status = err.status
    try {
      body = JSON.parse(err.message)
    } catch {
      return null
    }
  }
  return readProviderError(body, status)
}

export { readProviderError }
