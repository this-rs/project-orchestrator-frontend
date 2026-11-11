import { api, ApiError, buildQuery } from './api'
import type {
  LlmConsent,
  ModelPolicy,
  ProviderDraft,
  ProviderPatch,
  ProviderTestResult,
  RoleAssignments,
  SshHostKeyRequest,
  SshHostKeyResult,
} from '@/types/providerSettings'
import {
  CLAUDE_CODE_PROVIDER_ID,
  readProviderError,
  toCostBasis,
  type ModelAlias,
  type ProviderErrorInfo,
  type ProviderHealth,
  type ProviderHealthStatus,
  type ProviderId,
  type ProviderInstance,
  type ProviderModel,
  type ProvidersResponse,
  type ResolvedDefault,
} from '@/types/provider'
import { toLearningStage, toProviderRoutingMode, toRoutingScope, type RoutingSummary } from '@/types/routing'
import { toRateLimitReport, toRateLimits, type RateLimit } from '@/types/rateLimit'
import type { QuotaExhaustionCause, QuotaResponse, QuotaView, QuotaWindowStatus } from '@/types/quota'

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
    api.get<unknown>(`/chat/providers${buildQuery(params)}`).then(normalizeProvidersResponse),

  /** Health of one instance, re-checked now ("re-check" button, auth state, login command). */
  status: (id: ProviderId): Promise<ProviderHealth> =>
    api
      .get<unknown>(`/chat/providers/${encodeURIComponent(id)}/status`)
      // Same conversion as the list: the wire says `state`/`code`, the page reads `status`/`error`.
      .then((raw) => normalizeProviderHealth(raw, id)),

  /**
   * One saved instance as stored (`GET /chat/providers/{id}`, human route):
   * unlike the list, it carries `base_url` and `default_model`. A backend
   * without this route answers 404: the caller falls back to the list entry.
   */
  get: (id: ProviderId) =>
    api.get<unknown>(`/chat/providers/${encodeURIComponent(id)}`).then((raw) => normalizeStoredInstance(raw, id)),

  /** Model catalog of one instance. */
  models: (id: ProviderId) =>
    api.get<ProviderModel[]>(`/chat/providers/${encodeURIComponent(id)}/models`),

  // ---- Settings (routes the backend is adding; shapes in types/providerSettings.ts) ----
  // Every mutation needs a HUMAN token server-side: an agent's token gets a 403.
  // No body below ever carries a secret value, only a credential reference.

  /** Try a draft instance BEFORE saving it. */
  test: (draft: ProviderDraft | (ProviderPatch & { id?: ProviderId })) =>
    api.post<ProviderTestResult>('/chat/providers/test', draft),
  /** Asks the server to scan the host key of a machine. The human must confirm the fingerprint before it is pinned. */
  sshHostKey: (req: SshHostKeyRequest) => api.post<SshHostKeyResult>('/chat/providers/ssh-host-key', req),
  create: (draft: ProviderDraft) => api.post<unknown>('/chat/providers', draft),
  update: (id: ProviderId, patch: ProviderPatch) =>
    api.put<unknown>(`/chat/providers/${encodeURIComponent(id)}`, patch),
  remove: (id: ProviderId) => api.delete<void>(`/chat/providers/${encodeURIComponent(id)}`),

  /**
   * The current state of an instance's limits (RL7): usage, remaining, reset time
   * and status per limit. No counter exists yet server-side, so every entry comes
   * back `unknown` with null numbers — the shape is what this route settles.
   * An unreadable body yields `null` (never an invented limit).
   */
  limits: (id: ProviderId) =>
    api
      .get<unknown>(`/chat/providers/${encodeURIComponent(id)}/limits`)
      .then(toRateLimitReport)
      .catch(() => null),

  /**
   * The provider's own account quota (QUOTA): until when it refuses and how full its windows are.
   * `quota: null` when nothing is known; rejects on a refusal AND on a body that is not the wire
   * shape (see `normalizeQuota`). The human escape hatch is `clearQuota` below.
   */
  quota: (id: ProviderId): Promise<QuotaResponse> =>
    api.get<unknown>(`/chat/providers/${encodeURIComponent(id)}/quota`).then(normalizeQuota),

  /**
   * Forgets what is known of an account's quota (HUMAN only, like every mutation here). This is
   * the way out of an exclusion that outlived the provider's own reset — reachable from
   * Settings → Providers, and the clear survives a server restart.
   */
  clearQuota: (id: ProviderId) => api.delete<void>(`/chat/providers/${encodeURIComponent(id)}/quota`),

  /** What a project agreed to send to which endpoint. */
  consents: (projectSlug: string) =>
    api.get<LlmConsent[]>(`/projects/${encodeURIComponent(projectSlug)}/llm-consent`),
  allow: (projectSlug: string, providerId: ProviderId, origin: string) =>
    // Only `PUT /api/projects/{slug}/llm-consent` is known from the backend's
    // human-only guard (auth/middleware.rs); the body shape is an assumption.
    api.put<unknown>(`/projects/${encodeURIComponent(projectSlug)}/llm-consent`, { provider_id: providerId, origin }),
  /**
   * Allow one instance's origin for a project (`consent_scope: "project"` of a refused
   * opening): `PUT /api/projects/{slug}/llm-consents/{id}` with `{origin}`. Any signed-in person.
   */
  allowForProject: (projectSlug: string, providerId: ProviderId, origin: string) =>
    api.put<unknown>(
      `/projects/${encodeURIComponent(projectSlug)}/llm-consents/${encodeURIComponent(providerId)}`,
      { origin },
    ),
  /**
   * Allow one instance's origin for the chats OUTSIDE any project (`consent_scope:
   * "no_project"`): `PUT /api/chat/llm-consents/{id}` with `{origin}`. Root account only
   * (403 `root_required`): it decides for every user's chats. A project never inherits it.
   */
  allowOutsideProjects: (providerId: ProviderId, origin: string) =>
    api.put<unknown>(`/chat/llm-consents/${encodeURIComponent(providerId)}`, { origin }),
  revoke: (projectSlug: string, providerId: ProviderId) =>
    api.delete<void>(
      `/projects/${encodeURIComponent(projectSlug)}/llm-consent/${encodeURIComponent(providerId)}`,
    ),

  /** Pilot / executor roles, global then per project (an absent role inherits). */
  roles: () => api.get<RoleAssignments>('/chat/roles'),
  setRoles: (roles: RoleAssignments) => api.put<RoleAssignments>('/chat/roles', roles),
  projectRoles: (projectSlug: string) =>
    api.get<RoleAssignments>(`/projects/${encodeURIComponent(projectSlug)}/llm-roles`),
  setProjectRoles: (projectSlug: string, roles: RoleAssignments) =>
    api.put<RoleAssignments>(`/projects/${encodeURIComponent(projectSlug)}/llm-roles`, roles),

  aliases: () => api.get<ModelAlias[]>('/chat/model-aliases'),
  setAliases: (aliases: ModelAlias[]) => api.put<ModelAlias[]>('/chat/model-aliases', aliases),
  policy: () => api.get<ModelPolicy>('/chat/model-policy'),
  setPolicy: (policy: ModelPolicy) => api.put<ModelPolicy>('/chat/model-policy', policy),
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

/**
 * The reason of a refused request, as a sentence to show. A typed provider error gives its
 * message (without the code). Most routes here answer an UNTYPED `{"error": "<sentence>"}`
 * (backend `AppError`: "provider settings can only be changed by a signed-in user", "the chat
 * router is not running"…), which `toProviderError` reads as `null` — that sentence is then the
 * reason. `fallback` only when the server said nothing (no answer, an empty body).
 */
export function providerRefusalMessage(err: unknown, fallback: string): string {
  const typed = toProviderError(err)?.message
  if (typed) return typed
  if (!(err instanceof ApiError)) return fallback
  let body: unknown
  try {
    body = JSON.parse(err.message)
  } catch {
    // Not JSON: already a sentence (an expired session, an HTML answer named by `NonJsonResponseError`).
    return err.message || fallback
  }
  const b = obj(body)
  return (b && (str(b.error) ?? str(b.message))) || fallback
}

// ---------------------------------------------------------------------------
// GET /api/chat/providers — wire shape → internal shape
// ---------------------------------------------------------------------------
//
// The backend fixed its names in `docs/api/chat-contract/provider-additions.json`:
// `default_provider`, `is_default`, `endpoint_origin`, `credential`,
// `health { state, code, action, checked_at }`, `models[{ id, alias, capabilities }]`.
// The interface keeps one internal shape (`ProvidersResponse`); this is the
// only place that knows the wire. It also still reads the shape the interface
// was written against, so either backend works.

const HEALTH_STATE: Readonly<Record<string, ProviderHealthStatus>> = {
  ok: 'healthy',
  healthy: 'healthy',
  degraded: 'degraded',
  auth_required: 'auth_required',
  unreachable: 'unhealthy',
  unhealthy: 'unhealthy',
  unavailable: 'unhealthy',
  cli_not_found: 'unhealthy',
  unknown: 'unknown',
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)

/** `health` of the wire (`state`/`code`/`action`) or of the internal shape (`status`/`error`). */
export function normalizeProviderHealth(raw: unknown, providerId?: ProviderId): ProviderHealth {
  const h = obj(raw)
  if (!h) return { status: 'unknown' }
  const state = str(h.state) ?? str(h.status) ?? 'unknown'
  const status = HEALTH_STATE[state] ?? 'unknown'
  const action = str(h.action) ?? str(h.login_hint)
  const code =
    str(h.code) ??
    (state === 'cli_not_found' || state === 'auth_required'
      ? state
      : state === 'unavailable'
        ? 'provider_unavailable'
        : undefined)
  const error =
    readProviderError(h.error) ??
    (code && status !== 'healthy'
      ? readProviderError({ code, error: str(h.message) ?? str(h.reason) ?? str(h.error) ?? '', provider_id: providerId, action })
      : null)
  return {
    status,
    error,
    version: str(h.version) ?? null,
    login_hint: action ?? error?.login_hint ?? null,
    checked_at: str(h.checked_at) ?? null,
  }
}

function normalizeModel(raw: unknown): ProviderModel | null {
  const m = obj(raw)
  const id = m ? str(m.id) : undefined
  if (!m || !id) return null
  const aliases = Array.isArray(m.aliases) ? m.aliases.filter((a): a is string => typeof a === 'string') : []
  const alias = str(m.alias)
  if (alias && !aliases.includes(alias)) aliases.push(alias)
  const model: ProviderModel = { id }
  const label = str(m.label)
  if (label) model.label = label
  if (obj(m.capabilities)) model.capabilities = m.capabilities as ProviderModel['capabilities']
  if (aliases.length > 0) model.aliases = aliases
  return model
}

function normalizeInstance(raw: unknown): ProviderInstance | null {
  const p = obj(raw)
  const id = p ? str(p.id) : undefined
  if (!p || !id) return null
  const models = Array.isArray(p.models) ? p.models.map(normalizeModel).filter((m): m is ProviderModel => m !== null) : []
  const credential = str(p.credential) ?? str(p.credential_ref)
  const instance: ProviderInstance = {
    id,
    kind: str(p.kind) ?? 'claude_code',
    label: str(p.label) ?? id,
    builtin: bool(p.builtin) ?? id === CLAUDE_CODE_PROVIDER_ID,
    health: normalizeProviderHealth(p.health, id),
    models,
  }
  const preset = str(p.preset)
  if (preset) instance.preset = preset as ProviderInstance['preset']
  const origin = str(p.endpoint_origin) ?? str(p.origin)
  if (origin) instance.origin = origin
  if (str(p.base_url)) instance.base_url = str(p.base_url)
  if (credential) instance.credential_ref = credential as ProviderInstance['credential_ref']
  const cost = toCostBasis(p.cost_source)
  if (cost) instance.cost_source = cost
  if (str(p.default_model)) instance.default_model = str(p.default_model)
  if (str(p.host)) instance.host = str(p.host)
  if (str(p.ssh_user)) instance.ssh_user = str(p.ssh_user)
  if (typeof p.ssh_port === 'number') instance.ssh_port = p.ssh_port
  if (str(p.remote_cwd)) instance.remote_cwd = str(p.remote_cwd)
  if (bool(p.allow_trust) !== undefined) instance.allow_trust = bool(p.allow_trust)
  if (str(p.host_key_fingerprint)) instance.host_key_fingerprint = str(p.host_key_fingerprint)
  if (obj(p.capabilities)) instance.capabilities = p.capabilities as ProviderInstance['capabilities']
  if (bool(p.is_default) !== undefined) instance.is_default = bool(p.is_default)
  if (p.allowed_for_project === null || bool(p.allowed_for_project) !== undefined) {
    instance.allowed_for_project = p.allowed_for_project as boolean | null
  }
  return instance
}

/** The stored fields of `GET /chat/providers/{id}` (`instance_view` of the backend). */
export interface StoredInstance {
  id: ProviderId
  kind: string
  preset: string | null
  label: string
  base_url: string | null
  origin: string | null
  default_model: string | null
  /** The context window the operator DECLARED, in tokens. `null` = unknown. */
  context_window: number | null
  cost_source: ReturnType<typeof toCostBasis>
  credential_ref: string | null
  host: string | null
  ssh_user: string | null
  ssh_port: number | null
  remote_cwd: string | null
  allow_trust: boolean
  host_key_fingerprint: string | null
  /** The configured limits (RL1). Empty = no limit: the instance behaves as before. */
  rate_limit: RateLimit[]
}

export function normalizeStoredInstance(raw: unknown, id: ProviderId): StoredInstance {
  const r = obj(raw)
  if (!r) throw new Error(`GET /api/chat/providers/${id} : unexpected response`)
  return {
    id: str(r.id) ?? id,
    kind: str(r.kind) ?? 'openai_compatible',
    preset: str(r.preset) ?? null,
    label: str(r.label) ?? id,
    base_url: str(r.base_url) ?? null,
    origin: str(r.origin) ?? str(r.endpoint_origin) ?? null,
    default_model: str(r.default_model) ?? null,
    context_window: typeof r.context_window === 'number' ? r.context_window : null,
    cost_source: toCostBasis(r.cost_source),
    credential_ref: str(r.credential_ref) ?? str(r.credential) ?? null,
    host: str(r.host) ?? null,
    ssh_user: str(r.ssh_user) ?? null,
    ssh_port: typeof r.ssh_port === 'number' ? r.ssh_port : null,
    remote_cwd: str(r.remote_cwd) ?? null,
    allow_trust: r.allow_trust === true,
    host_key_fingerprint: str(r.host_key_fingerprint) ?? null,
    rate_limit: toRateLimits(r.rate_limit),
  }
}

/**
 * `GET /api/chat/providers/{id}/quota` → `{ now_ms, quota }`. `quota: null` is the server saying
 * that nothing is known. Anything else that is not the wire shape THROWS: a body that is not an
 * object, a `quota` that is absent or not an object, and a quota without the instants the card
 * shows (`observed_at_ms`, and `resets_at_ms` of an exhaustion). Nothing is invented for a hole —
 * a `0` there would read "observed 20 000 days ago" or "exhausted until 1 Jan 1970" — so the
 * caller shows an unreadable state instead. What the card does not show (name, source, windows)
 * keeps a neutral value.
 */
export function normalizeQuota(raw: unknown): QuotaResponse {
  const unreadable = (what: string) => new Error(`unreadable quota body: ${what}`)
  const r = obj(raw)
  if (!r) throw unreadable('not an object')
  const now_ms = (typeof r.now_ms === 'number' && r.now_ms) || Date.now()
  if (r.quota === null) return { now_ms, quota: null }
  const q = obj(r.quota)
  if (!q) throw unreadable('`quota` is neither null nor an object')
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const observed_at_ms = num(q.observed_at_ms)
  if (observed_at_ms === null) throw unreadable('`quota.observed_at_ms` is not a number')
  const windows = (Array.isArray(q.windows) ? q.windows : [])
    .map(obj)
    .filter((w): w is Record<string, unknown> => !!w)
    .map((w) => ({
      kind: str(w.kind) ?? '',
      utilization: num(w.utilization),
      resets_at_ms: num(w.resets_at_ms),
      status: (str(w.status) ?? 'allowed') as QuotaWindowStatus,
    }))
  let exhausted: QuotaView['exhausted'] = null
  if (q.exhausted !== null && q.exhausted !== undefined) {
    const ex = obj(q.exhausted)
    if (!ex) throw unreadable('`quota.exhausted` is neither null nor an object')
    const resets_at_ms = num(ex.resets_at_ms)
    if (resets_at_ms === null) throw unreadable('`quota.exhausted.resets_at_ms` is not a number')
    exhausted = {
      resets_at_ms,
      reset_known: ex.reset_known === true,
      window: str(ex.window) ?? null,
      cause: (str(ex.cause) ?? 'window') as QuotaExhaustionCause,
    }
  }
  const view: QuotaView = {
    provider_id: str(q.provider_id) ?? '',
    windows,
    source: (str(q.source) ?? 'live') as QuotaView['source'],
    observed_at_ms,
    exhausted,
  }
  return { now_ms, quota: view }
}

/** Whatever `GET /api/chat/providers` answered → `ProvidersResponse`. A body without `providers` is returned as is (the caller rejects it). */
export function normalizeProvidersResponse(raw: unknown): ProvidersResponse {
  const r = obj(raw)
  if (!r || !Array.isArray(r.providers)) return raw as ProvidersResponse
  const providers = r.providers.map(normalizeInstance).filter((p): p is ProviderInstance => p !== null)

  // Aliases: the wire puts them on each model (`alias`); the interface reads one flat list.
  const aliases: ModelAlias[] = Array.isArray(r.aliases)
    ? (r.aliases as unknown[]).map(obj).flatMap((a) => {
        const alias = a ? str(a.alias) : undefined
        const provider = a ? str(a.provider) : undefined
        const model = a ? str(a.model) : undefined
        return alias && provider && model ? [{ alias, provider, model }] : []
      })
    : []
  for (const p of providers) {
    for (const m of p.models) {
      for (const alias of m.aliases ?? []) {
        if (!aliases.some((a) => a.alias === alias && a.provider === p.id)) aliases.push({ alias, provider: p.id, model: m.id })
      }
    }
  }

  // Default: the resolved object of the internal shape, or the wire's `default_provider` / `is_default`.
  let resolved: ResolvedDefault | null | undefined
  const d = obj(r.default)
  if (d && str(d.provider)) {
    resolved = { provider: str(d.provider)!, model: str(d.model) ?? null, alias: str(d.alias) ?? null, routed_by: str(d.routed_by) ?? 'default' }
  } else if (r.default === null) {
    resolved = null
  } else {
    // `default_provider: null` (backend #722): nothing can answer by default here — never
    // read as Claude Code; the interface asks to choose a provider.
    const id = r.default_provider === null ? undefined : (str(r.default_provider) ?? providers.find((p) => p.is_default)?.id)
    resolved = id ? { provider: id, model: providers.find((p) => p.id === id)?.default_model ?? null, routed_by: str(r.routed_by) ?? 'default' } : r.default_provider === null ? null : undefined
  }

  const out: ProvidersResponse = { providers }
  if (resolved !== undefined) out.default = resolved
  if (aliases.length > 0) out.aliases = aliases
  const routing = normalizeRoutingSummary(r.routing)
  if (routing) out.routing = routing
  return out
}

/**
 * `routing` of `GET /api/chat/providers`: the mode and stage in force. `null`
 * when absent or when a value is not one the interface knows — the mode is
 * then read as `primary`, never guessed from a partial object.
 */
export function normalizeRoutingSummary(raw: unknown): RoutingSummary | null {
  const r = obj(raw)
  if (!r) return null
  const mode = toProviderRoutingMode(r.mode)
  const stage = toLearningStage(r.stage)
  if (!mode || !stage) return null
  return { mode, stage, scope: toRoutingScope(r.scope) ?? 'default' }
}
