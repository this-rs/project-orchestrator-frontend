import { api, ApiError, buildQuery } from './api'
import type {
  LlmConsent,
  ModelPolicy,
  ProviderDraft,
  ProviderPatch,
  ProviderTestResult,
  RoleAssignments,
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
  create: (draft: ProviderDraft) => api.post<unknown>('/chat/providers', draft),
  update: (id: ProviderId, patch: ProviderPatch) =>
    api.put<unknown>(`/chat/providers/${encodeURIComponent(id)}`, patch),
  remove: (id: ProviderId) => api.delete<void>(`/chat/providers/${encodeURIComponent(id)}`),

  /** What a project agreed to send to which endpoint. */
  consents: (projectSlug: string) =>
    api.get<LlmConsent[]>(`/projects/${encodeURIComponent(projectSlug)}/llm-consent`),
  allow: (projectSlug: string, providerId: ProviderId, origin: string) =>
    // Only `PUT /api/projects/{slug}/llm-consent` is known from the backend's
    // human-only guard (auth/middleware.rs); the body shape is an assumption.
    api.put<unknown>(`/projects/${encodeURIComponent(projectSlug)}/llm-consent`, { provider_id: providerId, origin }),
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
  const code = str(h.code) ?? (state === 'cli_not_found' || state === 'auth_required' ? state : undefined)
  const error =
    readProviderError(h.error) ??
    (code && status !== 'healthy'
      ? readProviderError({ code, error: str(h.message) ?? str(h.error) ?? '', provider_id: providerId, action })
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
  cost_source: ReturnType<typeof toCostBasis>
  credential_ref: string | null
}

export function normalizeStoredInstance(raw: unknown, id: ProviderId): StoredInstance {
  const r = obj(raw)
  if (!r) throw new Error(`GET /api/chat/providers/${id} : réponse inattendue`)
  return {
    id: str(r.id) ?? id,
    kind: str(r.kind) ?? 'openai_compatible',
    preset: str(r.preset) ?? null,
    label: str(r.label) ?? id,
    base_url: str(r.base_url) ?? null,
    origin: str(r.origin) ?? str(r.endpoint_origin) ?? null,
    default_model: str(r.default_model) ?? null,
    cost_source: toCostBasis(r.cost_source),
    credential_ref: str(r.credential_ref) ?? str(r.credential) ?? null,
  }
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
    const id = str(r.default_provider) ?? providers.find((p) => p.is_default)?.id
    resolved = id ? { provider: id, model: providers.find((p) => p.id === id)?.default_model ?? null, routed_by: str(r.routed_by) ?? 'default' } : r.default_provider === null ? null : undefined
  }

  const out: ProvidersResponse = { providers }
  if (resolved !== undefined) out.default = resolved
  if (aliases.length > 0) out.aliases = aliases
  return out
}
