import { api, ApiError, buildQuery } from './api'
import {
  PROVIDER_ERROR_CODES,
  type ProviderErrorCode,
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
 * The server answers a provider failure as `{ code, error|message, … }` with a
 * status of its choosing; `ApiError.message` carries that raw body. Returns
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

/** Same, for an already-parsed object (WS `session_error`, `health.error`). */
export function readProviderError(body: unknown, status?: number): ProviderErrorInfo | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const code = b.code
  if (typeof code !== 'string' || !(PROVIDER_ERROR_CODES as readonly string[]).includes(code)) return null
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    code: code as ProviderErrorCode,
    message: str(b.error) ?? str(b.message) ?? '',
    provider_id: str(b.provider_id) ?? str(b.provider),
    login_hint: str(b.login_hint),
    retry_after: num(b.retry_after),
    capability: str(b.capability),
    retryable: typeof b.retryable === 'boolean' ? b.retryable : undefined,
    origin: str(b.origin),
    project_slug: str(b.project_slug),
    model: str(b.model),
    status,
  }
}
