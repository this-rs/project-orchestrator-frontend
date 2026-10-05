// ============================================================================
// PROVIDERS — the agent harness behind a chat session
// ============================================================================
//
// A session used to mean "a Claude Code subprocess". It now runs on a provider
// INSTANCE (`claude-code`, a local llama-server, a DeepSeek endpoint, Codex…),
// and what the interface may offer depends on what that instance + model can do.
//
// Everything here is read defensively: a session created before providers
// existed carries no `provider` at all, and must behave exactly like a
// `claude-code` session with every capability on.

/** Id of a provider INSTANCE (not of a kind): `claude-code`, `local-llama`, … */
export type ProviderId = string

/** The built-in instance. A session without a provider is one of these. */
export const CLAUDE_CODE_PROVIDER_ID: ProviderId = 'claude-code'

/**
 * What kind of harness an instance is.
 * - `claude_code` — the Claude Code CLI (built-in instance).
 * - `openai_compatible` — the native harness on an OpenAI-compatible endpoint.
 * - `codex` — Codex `app-server`.
 * - `acp` — a generic ACP agent over stdio (opencode, Gemini CLI).
 *
 * Open-ended on purpose: the backend enum is `#[non_exhaustive]`, so an unknown
 * kind must render (as a generic provider), never throw.
 */
export type KnownProviderKind = 'claude_code' | 'openai_compatible' | 'codex' | 'acp'
export type ProviderKind = KnownProviderKind | (string & {})

/** Presets of the OpenAI-compatible kind offered by the "add instance" form. */
export type ProviderPreset = 'deepseek' | 'nim' | 'ollama' | 'vllm' | 'llama_server'

// ----------------------------------------------------------------------------
// Tool policy (neutral permission modes)
// ----------------------------------------------------------------------------

/** Provider-neutral permission mode. */
export type ToolPolicyMode = 'ask' | 'auto_edits' | 'plan_only' | 'trust'

export const TOOL_POLICY_MODES: readonly ToolPolicyMode[] = ['ask', 'auto_edits', 'plan_only', 'trust']

/**
 * Every permission-mode string the Claude CLI knows: the four the app has
 * always sent, the two renamed/added by recent CLIs (`manual`, `auto`,
 * `dontAsk`), read but never written by this app.
 */
export type LegacyPermissionMode =
  | 'default'
  | 'manual'
  | 'acceptEdits'
  | 'auto'
  | 'dontAsk'
  | 'plan'
  | 'bypassPermissions'

/**
 * Legacy (Claude) mode → neutral mode. The ONLY place where Claude mode
 * strings are given a meaning.
 *
 * `auto` (a classifier approves what looks safe) and `dontAsk` (deny what is
 * not pre-approved) have no exact neutral twin: each maps to the closest mode
 * that is NOT more permissive than the original.
 */
export const LEGACY_MODE_TO_POLICY: Readonly<Record<LegacyPermissionMode, ToolPolicyMode>> = {
  default: 'ask',
  manual: 'ask',
  dontAsk: 'ask',
  acceptEdits: 'auto_edits',
  auto: 'auto_edits',
  plan: 'plan_only',
  bypassPermissions: 'trust',
}

/** Neutral mode → the legacy string a pre-provider backend understands. */
export const POLICY_TO_LEGACY_MODE: Readonly<Record<ToolPolicyMode, 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'>> = {
  ask: 'default',
  auto_edits: 'acceptEdits',
  plan_only: 'plan',
  trust: 'bypassPermissions',
}

/**
 * Read a permission mode in either form (neutral or legacy Claude string).
 * Returns `null` for anything else: an unknown mode is never guessed.
 */
export function toToolPolicyMode(value: unknown): ToolPolicyMode | null {
  if (typeof value !== 'string') return null
  if ((TOOL_POLICY_MODES as readonly string[]).includes(value)) return value as ToolPolicyMode
  if (Object.prototype.hasOwnProperty.call(LEGACY_MODE_TO_POLICY, value)) {
    return LEGACY_MODE_TO_POLICY[value as LegacyPermissionMode]
  }
  return null
}

/** The policy of a session as `system_init` carries it. */
export interface ToolPolicy {
  mode: ToolPolicyMode
  /** Exact provider-native mode when known (`auto`, `dontAsk`…): kept so no information is lost. */
  native_mode?: string
  /** Patterns in Claude syntax: `Read`, `Bash(git *)`. */
  allow: string[]
  deny: string[]
}

/** Category of a tool call, supplied by the provider adapter (never guessed from the name when present). */
export type ToolCategory = 'command' | 'read' | 'edit' | 'search' | 'web' | 'mcp' | 'agent' | 'other'

export const TOOL_CATEGORIES: readonly ToolCategory[] = ['command', 'read', 'edit', 'search', 'web', 'mcp', 'agent', 'other']

export function toToolCategory(value: unknown): ToolCategory | null {
  return typeof value === 'string' && (TOOL_CATEGORIES as readonly string[]).includes(value)
    ? (value as ToolCategory)
    : null
}

// ----------------------------------------------------------------------------
// Capabilities
// ----------------------------------------------------------------------------

export type HooksSupport = 'in_protocol' | 'command' | 'none'
/** How long a permission answer may be remembered. */
export type PermissionScope = 'once' | 'session' | 'always'
export const PERMISSION_SCOPES: readonly PermissionScope[] = ['once', 'session', 'always']
export type SandboxLevel = 'none' | 'workspace' | 'full'
export type SubagentsSupport = 'nested' | 'separate_thread' | 'none'

/**
 * Where a displayed cost comes from.
 * - `reported` — the provider billed/reported it.
 * - `priced` — computed from a price table: an ESTIMATE.
 * - `free` — a local endpoint; nothing is charged.
 * - `subscription` — flat-rate plan; a dollar figure would be notional.
 * - `unknown` — no price known. NEVER shown as "$0".
 */
export type CostBasis = 'reported' | 'priced' | 'free' | 'subscription' | 'unknown'

export const COST_BASES: readonly CostBasis[] = ['reported', 'priced', 'free', 'subscription', 'unknown']

export interface ContextWindow {
  /** Tokens. */
  value: number
  /** Who said so: `reported | catalog | configured | probed | assumed`. */
  source: string
}

/**
 * What a (provider, model) pair can do. PER MODEL, frozen on the session when
 * it opens. Each absent capability has a visible fallback in the interface —
 * a control that silently does nothing is a bug.
 */
export interface ProviderCapabilities {
  /** The provider can pause a tool call and ask the human. */
  interactive_permissions: boolean
  /** Scopes a permission answer may use. Only the listed ones are offered ("Remember for this session"…). */
  permission_scopes: PermissionScope[]
  /** Tool sandboxing. With `none`, `trust` is refused for a third-party model. */
  sandbox: SandboxLevel
  /** Secrets are kept out of the model's reach. */
  secret_isolation: boolean
  /** MCP servers can be attached per session. */
  per_session_mcp: boolean
  hooks: HooksSupport
  subagents: SubagentsSupport
  /** The provider announces context compaction (start + boundary). */
  compaction_signal: boolean
  /** Reasoning blocks are emitted. */
  thinking: boolean
  /** Image inputs are accepted. */
  images: boolean
  /** The model can call tools at all. */
  tools: boolean
  /** `null` = unknown: no token budget possible, and never an implicit 200k. */
  context_window: ContextWindow | null
  /** The model can be changed on a live session. */
  set_model_live: boolean
  /** The provider has a native "ask the user a question" tool. */
  native_question: boolean
  /** Running tools can be cancelled without ending the turn. */
  tool_cancel: boolean
  /** Long-lived background tasks are tracked. */
  background_tasks: boolean
  /** A closed session can be resumed. */
  resume: boolean
  cost: CostBasis
}

/**
 * The complete profile: what Claude Code does today. It is the fallback for a
 * session or `system_init` WITHOUT a provider, so nothing changes for sessions
 * created before providers existed.
 */
export const CLAUDE_CODE_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  interactive_permissions: true,
  permission_scopes: ['once', 'session', 'always'],
  sandbox: 'none',
  secret_isolation: true,
  per_session_mcp: true,
  hooks: 'in_protocol',
  subagents: 'nested',
  compaction_signal: true,
  thinking: true,
  // The backend may declare `images: false` for Claude Code in v1; the FALLBACK
  // keeps what a pre-provider session could do, which includes attachments.
  images: true,
  tools: true,
  context_window: null,
  set_model_live: true,
  native_question: true,
  tool_cancel: true,
  background_tasks: true,
  resume: true,
  cost: 'reported',
} satisfies ProviderCapabilities)

/**
 * The floor: what is assumed of a NON-Claude provider for every capability it
 * did not declare. Conservative on purpose — an undeclared capability is
 * absent, and absent means "explained on screen", not "offered and broken".
 */
export const MINIMAL_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze({
  interactive_permissions: false,
  permission_scopes: [],
  sandbox: 'none',
  secret_isolation: false,
  per_session_mcp: false,
  hooks: 'none',
  subagents: 'none',
  compaction_signal: false,
  thinking: false,
  images: false,
  tools: false,
  context_window: null,
  set_model_live: false,
  native_question: false,
  tool_cancel: false,
  background_tasks: false,
  resume: false,
  cost: 'unknown',
} satisfies ProviderCapabilities)

/** Boolean capability fields, for iteration (tests, settings table). */
export const BOOLEAN_CAPABILITY_KEYS = [
  'interactive_permissions',
  'secret_isolation',
  'per_session_mcp',
  'compaction_signal',
  'thinking',
  'images',
  'tools',
  'set_model_live',
  'native_question',
  'tool_cancel',
  'background_tasks',
  'resume',
] as const satisfies readonly (keyof ProviderCapabilities)[]

/** Every key of `ProviderCapabilities` — the field-level contract test iterates over it. */
export const CAPABILITY_KEYS = [
  ...BOOLEAN_CAPABILITY_KEYS,
  'permission_scopes',
  'sandbox',
  'hooks',
  'subagents',
  'context_window',
  'cost',
] as const satisfies readonly (keyof ProviderCapabilities)[]

/** `InProtocol` / `in_protocol` / `SeparateThread` → `in_protocol` / `separate_thread`. */
function snake(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = snake(value)
  return s !== null && (allowed as readonly string[]).includes(s) ? (s as T) : null
}

export function toCostBasis(value: unknown): CostBasis | null {
  return oneOf(value, COST_BASES)
}

/** True for the built-in instance and for an absent provider (legacy session). */
export function isClaudeCodeProvider(provider: ProviderId | null | undefined, kind?: ProviderKind | null): boolean {
  if (kind) return snake(kind) === 'claude_code'
  return provider == null || provider === '' || provider === CLAUDE_CODE_PROVIDER_ID
}

/**
 * Read a capabilities object off the wire.
 *
 * - `raw` absent → `base` untouched.
 * - a field absent or of the wrong type → the value of `base` for that field.
 *
 * `base` is the Claude profile for a Claude/legacy session and the minimal
 * profile for anything else (see `capabilitiesFallback`).
 */
export function normalizeCapabilities(
  raw: unknown,
  base: Readonly<ProviderCapabilities> = CLAUDE_CODE_CAPABILITIES,
): ProviderCapabilities {
  const out: ProviderCapabilities = {
    ...base,
    permission_scopes: [...base.permission_scopes],
    context_window: base.context_window ? { ...base.context_window } : null,
  }
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  for (const key of BOOLEAN_CAPABILITY_KEYS) {
    if (typeof r[key] === 'boolean') out[key] = r[key] as boolean
  }
  if (Array.isArray(r.permission_scopes)) {
    out.permission_scopes = r.permission_scopes
      .map((v) => oneOf<PermissionScope>(v, PERMISSION_SCOPES))
      .filter((v): v is PermissionScope => v !== null)
  }
  out.sandbox = oneOf<SandboxLevel>(r.sandbox, ['none', 'workspace', 'full']) ?? out.sandbox
  out.hooks = oneOf<HooksSupport>(r.hooks, ['in_protocol', 'command', 'none']) ?? out.hooks
  out.subagents = oneOf<SubagentsSupport>(r.subagents, ['nested', 'separate_thread', 'none']) ?? out.subagents
  out.cost = toCostBasis(r.cost) ?? out.cost
  const cw = r.context_window
  if (cw === null) {
    out.context_window = null
  } else if (typeof cw === 'object') {
    const c = cw as Record<string, unknown>
    if (typeof c.value === 'number') {
      out.context_window = { value: c.value, source: typeof c.source === 'string' ? c.source : 'reported' }
    }
  }
  return out
}

/** Tools run in a sandbox (`workspace` or `full`). */
export function hasSandbox(caps: Pick<ProviderCapabilities, 'sandbox'>): boolean {
  return caps.sandbox !== 'none'
}

/** A permission answer may be remembered with this scope. */
export function supportsScope(caps: Pick<ProviderCapabilities, 'permission_scopes'>, scope: PermissionScope): boolean {
  return caps.permission_scopes.includes(scope)
}

/** The profile assumed for the fields a provider did not declare. */
export function capabilitiesFallback(
  provider: ProviderId | null | undefined,
  kind?: ProviderKind | null,
): Readonly<ProviderCapabilities> {
  return isClaudeCodeProvider(provider, kind) ? CLAUDE_CODE_CAPABILITIES : MINIMAL_CAPABILITIES
}

// ----------------------------------------------------------------------------
// Provider reference carried by `system_init`
// ----------------------------------------------------------------------------

/** `system_init.provider`, once read: always an id, sometimes more. */
export interface ProviderRef {
  id: ProviderId
  kind?: ProviderKind
  label?: string
}

/**
 * Read `system_init.provider`, which is an instance id (string) or an object
 * `{ id, kind?, label? }`. Absent → `null` (legacy session → Claude Code).
 */
export function toProviderRef(raw: unknown): ProviderRef | null {
  if (typeof raw === 'string') return raw === '' ? null : { id: raw }
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || r.id === '') return null
    return {
      id: r.id,
      kind: typeof r.kind === 'string' ? (snake(r.kind) as ProviderKind) : undefined,
      label: typeof r.label === 'string' ? r.label : undefined,
    }
  }
  return null
}

/** `system_init.tool_policy`, read in either form (object, or a bare mode string). */
export function toToolPolicy(raw: unknown): ToolPolicy | null {
  if (typeof raw === 'string') {
    const mode = toToolPolicyMode(raw)
    if (!mode) return null
    // A legacy string that is not one of the four neutral names IS the native mode.
    return (TOOL_POLICY_MODES as readonly string[]).includes(raw)
      ? { mode, allow: [], deny: [] }
      : { mode, native_mode: raw, allow: [], deny: [] }
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const mode = toToolPolicyMode(r.mode)
  if (!mode) return null
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const policy: ToolPolicy = { mode, allow: strings(r.allow), deny: strings(r.deny) }
  if (typeof r.native_mode === 'string' && r.native_mode !== '') policy.native_mode = r.native_mode
  return policy
}

// ----------------------------------------------------------------------------
// Typed provider errors
// ----------------------------------------------------------------------------

/**
 * `code` of a typed provider error (HTTP body `{ code, error, … }`), plus the
 * codes the gateway adds around the provider (`no_provider`,
 * `endpoint_not_allowed`, `instance_not_found`, `provider_conflict`).
 */
export type ProviderErrorCode =
  | 'no_provider'
  | 'endpoint_not_allowed'
  | 'instance_not_found'
  | 'provider_conflict'
  | 'cli_not_found'
  | 'auth_required'
  | 'credentials_locked'
  | 'unauthorized'
  | 'endpoint_unreachable'
  | 'model_no_tools'
  | 'context_too_small'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'process_exited'
  | 'protocol'
  | 'unsupported'
  | 'turn_in_progress'
  | 'invalid_request'
  | 'closed'

export const PROVIDER_ERROR_CODES: readonly ProviderErrorCode[] = [
  'no_provider',
  'endpoint_not_allowed',
  'instance_not_found',
  'provider_conflict',
  'cli_not_found',
  'auth_required',
  'credentials_locked',
  'unauthorized',
  'endpoint_unreachable',
  'model_no_tools',
  'context_too_small',
  'rate_limited',
  'overloaded',
  'timeout',
  'process_exited',
  'protocol',
  'unsupported',
  'turn_in_progress',
  'invalid_request',
  'closed',
]

/** A provider error as the interface handles it. Never carries a credential. */
export interface ProviderErrorInfo {
  code: ProviderErrorCode
  /** Human sentence from the server (already redacted). */
  message: string
  provider_id?: ProviderId
  /** `auth_required`: the command the user must run in a terminal. */
  login_hint?: string
  /** `rate_limited`: milliseconds to wait. */
  retry_after_ms?: number
  /** Redacted technical detail (`endpoint_unreachable`, `protocol`, `invalid_request`). */
  detail?: string
  /** `cli_not_found`: the program that is missing. */
  program?: string
  /** `context_too_small`: tokens needed / available. */
  needed?: number
  available?: number
  /** `unsupported`: which capability. */
  capability?: string
  retryable?: boolean
  /** `endpoint_not_allowed`: where the project's content would go. */
  origin?: string
  project_slug?: string
  model?: string
  /** HTTP status the error arrived with, when it came over REST. */
  status?: number
}

/**
 * Read a typed provider error off an already-parsed object (REST body, WS
 * `session_error`, `health.error`). `null` when the object carries no known
 * `code`: a code is never invented. Pure, so both chat reducers can use it.
 */
export function readProviderError(body: unknown, status?: number): ProviderErrorInfo | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const code = b.code ?? b.kind
  if (typeof code !== 'string' || !(PROVIDER_ERROR_CODES as readonly string[]).includes(code)) return null
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    code: code as ProviderErrorCode,
    message: str(b.error) ?? str(b.message) ?? '',
    provider_id: str(b.provider_id) ?? str(b.provider),
    login_hint: str(b.login_hint),
    retry_after_ms: num(b.retry_after_ms) ?? (num(b.retry_after) !== undefined ? num(b.retry_after)! * 1000 : undefined),
    detail: str(b.detail),
    program: str(b.program),
    needed: num(b.needed),
    available: num(b.available),
    capability: str(b.capability),
    retryable: typeof b.retryable === 'boolean' ? b.retryable : undefined,
    origin: str(b.origin),
    project_slug: str(b.project_slug),
    model: str(b.model),
    status,
  }
}

// ----------------------------------------------------------------------------
// Instances (GET /api/chat/providers)
// ----------------------------------------------------------------------------

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'auth_required' | 'unknown'

export interface ProviderHealth {
  status: ProviderHealthStatus
  /** Set when not healthy. */
  error?: ProviderErrorInfo | null
  /** Version of the CLI / server, when known. */
  version?: string | null
  /** `auth_required`: the command to run. PO never drives a CLI login itself. */
  login_hint?: string | null
  checked_at?: string | null
}

/** A model of an instance, with ITS capabilities (they are per model). */
export interface ProviderModel {
  id: string
  label?: string
  capabilities?: Partial<ProviderCapabilities>
  /** Logical aliases pointing at this model (`fast`, `default`, …). */
  aliases?: string[]
}

/** Where a secret lives. The value itself never reaches this app. */
export type CredentialRef = `vault:${string}` | `env:${string}` | 'none'

export interface ProviderInstance {
  id: ProviderId
  kind: ProviderKind
  label: string
  /** The `claude-code` instance cannot be deleted. */
  builtin?: boolean
  preset?: ProviderPreset | null
  /** Origin (scheme://host:port) of the endpoint — what a consent is bound to. */
  origin?: string | null
  base_url?: string | null
  /** Reference only (`vault:<name>`, `env:<VAR>`, `none`). */
  credential_ref?: CredentialRef | null
  cost_source?: CostBasis | null
  health: ProviderHealth
  models: ProviderModel[]
  default_model?: string | null
  /** Instance-level capabilities, used when a model declares none. */
  capabilities?: Partial<ProviderCapabilities>
  /** Whether the project given as `project_slug` may send content to it. Absent = no project asked. */
  allowed_for_project?: boolean | null
}

/** Which rule picked the default (persisted server-side as `routed_by`). */
export type RoutedBy =
  | 'session'
  | 'request'
  | 'task'
  | 'persona'
  | 'run'
  | 'project_rule'
  | 'global_rule'
  | 'configured_default'
  | 'claude_code_fallback'
  | (string & {})

export interface ResolvedDefault {
  provider: ProviderId
  model?: string | null
  alias?: string | null
  routed_by: RoutedBy
}

/** A logical model name → (instance, model). */
export interface ModelAlias {
  alias: string
  provider: ProviderId
  model: string
}

export interface ProvidersResponse {
  providers: ProviderInstance[]
  /** What a new session gets when nothing is chosen. `null` = no usable provider. */
  default?: ResolvedDefault | null
  aliases?: ModelAlias[]
}

/** Human label of a kind — one module for every provider-facing string. */
export const PROVIDER_KIND_LABELS: Readonly<Record<KnownProviderKind, string>> = {
  claude_code: 'Claude Code',
  openai_compatible: 'OpenAI-compatible',
  codex: 'Codex',
  acp: 'ACP agent',
}

export function providerKindLabel(kind: ProviderKind | null | undefined): string {
  if (!kind) return PROVIDER_KIND_LABELS.claude_code
  const k = snake(kind) ?? ''
  return (PROVIDER_KIND_LABELS as Record<string, string>)[k] ?? String(kind)
}

/** Capabilities of (instance, model): model-level, then instance-level, then the fallback profile. */
export function capabilitiesFor(
  instance: ProviderInstance | null | undefined,
  model: string | null | undefined,
): ProviderCapabilities {
  if (!instance) return normalizeCapabilities(null, CLAUDE_CODE_CAPABILITIES)
  const base = normalizeCapabilities(instance.capabilities, capabilitiesFallback(instance.id, instance.kind))
  const m = model ? instance.models.find((x) => x.id === model) : undefined
  return m?.capabilities ? normalizeCapabilities(m.capabilities, base) : base
}
