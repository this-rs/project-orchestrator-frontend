// ============================================================================
// PROVIDER WIZARD — labels, validation and status of the Providers page
// ============================================================================
//
// The "Add a provider" wizard and the provider cards speak the user's language
// (`providerAdmin.common.*` in the i18n catalog). Every typed error code the
// backend can answer on these routes has its own sentence there; an unknown
// code falls back to the English explanation of `providerErrors.ts`.
//
// Functions that produce text take the translator `t` as their LAST argument;
// tables hold message keys, never text.
//
// Nothing in this module ever receives a secret value.

import { ApiError, apiErrorMessage } from '@/services/api'
import { toProviderError } from '@/services/providers'
import type { MessageKey } from '@/i18n/catalog'
import type { Translator } from '@/i18n/translate'
import { providerErrorExplanation } from './providerErrors'
import type {
  CostBasis,
  ProviderErrorInfo,
  ProviderHealth,
  ProviderInstance,
  ProviderModel,
} from '@/types/provider'

export type T = Translator['t']

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const COST_LABEL_KEYS: Readonly<Record<CostBasis, MessageKey>> = {
  reported: 'providerAdmin.common.cost.reported',
  priced: 'providerAdmin.common.cost.priced',
  free: 'providerAdmin.common.cost.free',
  subscription: 'providerAdmin.common.cost.subscription',
  unknown: 'providerAdmin.common.cost.unknown',
}

const KIND_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  claude_code: 'providerAdmin.common.kinds.claude_code',
  openai_compatible: 'providerAdmin.common.kinds.openai_compatible',
  codex: 'providerAdmin.common.kinds.codex',
  acp: 'providerAdmin.common.kinds.acp',
  claude_code_remote: 'providerAdmin.common.kinds.claude_code_remote',
}

export function kindLabel(t: T, kind: string | null | undefined): string {
  const key = kind ? KIND_LABEL_KEYS[kind] : undefined
  return key ? t(key) : kind || t('providerAdmin.common.kinds.unknown')
}

/** `codex`, `acp` and `claude_code_remote` instances are a program (local or over SSH): no URL, no URL guard. */
export function isProcessKind(kind: string | null | undefined): boolean {
  return kind === 'codex' || kind === 'acp' || kind === 'claude_code_remote'
}

export const WIZARD_STEPS = [
  { id: 'preset', title: 'providerWizard.steps.preset' },
  { id: 'key', title: 'providerWizard.steps.key' },
  { id: 'connection', title: 'providerWizard.steps.connection' },
  { id: 'project', title: 'providerWizard.steps.project' },
  { id: 'summary', title: 'providerWizard.steps.summary' },
] as const satisfies readonly { id: string; title: MessageKey }[]
export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

/** Durations of the grant of a key to an instance. */
export const GRANT_CHOICES: { value: string; label: MessageKey }[] = [
  { value: '60', label: 'providerWizard.grant.h1' },
  { value: '1440', label: 'providerWizard.grant.d1' },
  { value: '10080', label: 'providerWizard.grant.d7' },
  { value: '43200', label: 'providerWizard.grant.d30' },
]

export type TaskKey = 'secret' | 'instance' | 'grant' | 'test'
export type TaskState = 'todo' | 'running' | 'done' | 'error'

export const TASK_LABEL_KEYS: Readonly<Record<TaskKey, MessageKey>> = {
  secret: 'providerWizard.tasks.secret',
  instance: 'providerWizard.tasks.instance',
  grant: 'providerWizard.tasks.grant',
  test: 'providerWizard.tasks.test',
}

// ---------------------------------------------------------------------------
// Validation (mirrors the backend: `valid_id` of settings.rs, `validate_name` of vault/store.rs)
// ---------------------------------------------------------------------------

/** Instance id: lowercase letters, digits and dashes, starts with a letter or digit, ≤ 48. */
const INSTANCE_ID = /^[a-z0-9][a-z0-9-]*$/
/** Vault secret name: letters, digits, `_`, `-`, `.`, ≤ 64. */
const SECRET_NAME = /^[A-Za-z0-9_.-]+$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateInstanceId(raw: string, taken: readonly string[], t: T): string | null {
  const id = raw.trim()
  if (!id) return t('providerAdmin.common.validation.idRequired')
  if (id.length > 48 || !INSTANCE_ID.test(id)) return t('providerAdmin.common.validation.idFormat')
  if (id === 'claude-code') return t('providerAdmin.common.validation.idReserved')
  if (taken.includes(id)) return t('providerAdmin.common.validation.idTaken')
  return null
}

export function validateSecretName(raw: string, t: T): string | null {
  const name = raw.trim()
  if (!name) return t('providerAdmin.common.validation.secretRequired')
  if (name.length > 64 || !SECRET_NAME.test(name))
    return t('providerAdmin.common.validation.secretFormat')
  return null
}

export function validateEnvName(raw: string, t: T): string | null {
  const name = raw.trim()
  if (!name) return t('providerAdmin.common.validation.envRequired')
  if (!ENV_NAME.test(name)) return t('providerAdmin.common.validation.envFormat')
  return null
}

/** Localised twin of `validateBaseUrl`: https everywhere, plain http on a loopback host only. */
export function validateBaseUrlFr(raw: string, t: T): string | null {
  const value = raw.trim()
  if (!value) return t('providerAdmin.common.validation.urlRequired')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return t('providerAdmin.common.validation.urlInvalid')
  }
  if (url.protocol === 'https:') return null
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '::1'))
    return null
  return t('providerAdmin.common.validation.urlHttps')
}

/** Suggested vault name for the key of an instance: its id. */
export function suggestedSecretName(instanceId: string): string {
  return instanceId.trim() || 'provider-key'
}

// ---------------------------------------------------------------------------
// Errors in plain words
// ---------------------------------------------------------------------------

/** Codes that have their own sentence in `providerAdmin.common.errors`. */
const ERROR_CODES = [
  'credentials_locked',
  'auth_required',
  'unauthorized',
  'endpoint_unreachable',
  'model_no_tools',
  'context_too_small',
  'cli_not_found',
  'rate_limited',
  'overloaded',
  'timeout',
  'process_exited',
  'protocol',
  'unsupported',
  'invalid_request',
  'provider_unknown',
  'provider_unavailable',
  'security_gate_closed',
  'origin_mismatch',
  'endpoint_not_allowed',
  'endpoint_invalid_url',
  'endpoint_scheme_not_allowed',
  'endpoint_http_outside_loopback',
  'endpoint_credentials_in_url',
  'endpoint_host_missing',
  'endpoint_private_address',
  'endpoint_unresolvable',
  'endpoint_redirects_not_allowed',
  'credential_test_requires_saved_instance',
  'tool_not_in_profile',
] as const
type ErrorCode = (typeof ERROR_CODES)[number]

const isErrorCode = (code: string): code is ErrorCode => (ERROR_CODES as readonly string[]).includes(code)

/** The model ran and did not call the test tool: about THIS model, not the endpoint. */
export const toolsNotCalledText = (t: T): string => t('providerAdmin.common.errors.model_no_tools')

/** Sentence for a typed provider error. */
export function providerErrorFr(error: ProviderErrorInfo, t: T): string {
  return isErrorCode(error.code)
    ? t(`providerAdmin.common.errors.${error.code}`)
    : providerErrorExplanation(error)
}

/** Sentence for a code read out of a test verdict (`health.code`). */
export function verdictCodeFr(code: string | null | undefined, t: T): string | null {
  if (!code || !isErrorCode(code)) return null
  return t(`providerAdmin.common.errors.${code}`)
}

/**
 * What to tell the user about a failed call of the wizard or the cards.
 * A typed code is translated; a 403 is the human-token rule; anything else is
 * the server's own sentence (which never carries a secret, per provider-errors.md).
 */
export function wizardErrorMessage(err: unknown, t: T): string {
  const typed = toProviderError(err)
  if (typed) return providerErrorFr(typed, t)
  if (err instanceof ApiError && err.status === 403) {
    return /passphrase|proof/i.test(err.message)
      ? t('providerAdmin.common.errors.vaultPassphrase')
      : t('providerAdmin.common.errors.forbidden')
  }
  if (err instanceof ApiError && err.status === 409 && /locked/i.test(err.message))
    return t('providerAdmin.common.errors.vaultLocked')
  return apiErrorMessage(err, t('providerAdmin.common.errors.requestFailed'))
}

// ---------------------------------------------------------------------------
// Card status: one glance
// ---------------------------------------------------------------------------

export type InstanceStatusKey =
  | 'connected'
  | 'key_missing'
  | 'login_required'
  | 'vault_locked'
  | 'key_refused'
  | 'not_allowed'
  | 'unreachable'
  | 'degraded'
  | 'unchecked'

export interface InstanceStatus {
  key: InstanceStatusKey
  label: MessageKey
  variant: 'success' | 'warning' | 'error' | 'default'
}

export function instanceStatus(instance: ProviderInstance, health: ProviderHealth): InstanceStatus {
  const code = health.error?.code
  if (code === 'credentials_locked')
    return { key: 'vault_locked', label: 'providerAdmin.common.status.vaultLocked', variant: 'warning' }
  if (code === 'unauthorized')
    return { key: 'key_refused', label: 'providerAdmin.common.status.keyRefused', variant: 'error' }
  if (health.status === 'auth_required' || code === 'auth_required') {
    // A key reference that cannot be read (missing from the vault, not granted) vs. a program to sign in to.
    const usesKey = !!instance.credential_ref && instance.credential_ref !== 'none'
    return usesKey && !health.login_hint
      ? { key: 'key_missing', label: 'providerAdmin.common.status.keyMissing', variant: 'warning' }
      : { key: 'login_required', label: 'providerAdmin.common.status.loginRequired', variant: 'warning' }
  }
  if (health.status === 'unhealthy')
    return { key: 'unreachable', label: 'providerAdmin.common.status.unreachable', variant: 'error' }
  if (instance.allowed_for_project === false)
    return { key: 'not_allowed', label: 'providerAdmin.common.status.notAllowed', variant: 'warning' }
  if (health.status === 'healthy')
    return { key: 'connected', label: 'providerAdmin.common.status.connected', variant: 'success' }
  if (health.status === 'degraded')
    return { key: 'degraded', label: 'providerAdmin.common.status.degraded', variant: 'warning' }
  return { key: 'unchecked', label: 'providerAdmin.common.status.unchecked', variant: 'default' }
}

/** A date in the viewer's language and time zone (`never` when absent). */
export function formatWhenFr(tr: Pick<Translator, 't' | 'date'>, iso: string | null | undefined): string {
  if (!iso) return tr.t('providerAdmin.common.never')
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : tr.date(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Consent, roles, aliases and policy (the sections under the cards)
// ---------------------------------------------------------------------------

export const CONSENT_STATE_KEYS = {
  allowed: 'providerAdmin.common.consentState.allowed',
  denied: 'providerAdmin.common.consentState.denied',
  invalidated: 'providerAdmin.common.consentState.invalidated',
} as const satisfies Record<string, MessageKey>

export const ROLE_LABEL_KEYS = {
  pilot: 'providerAdmin.common.roles.pilot',
  executor: 'providerAdmin.common.roles.executor',
} as const satisfies Record<string, MessageKey>

const ROUTED_BY = [
  'session',
  'request',
  'task',
  'persona',
  'run',
  'project_rule',
  'global_rule',
  'default',
  'claude_code',
  'fallback',
  'auto',
] as const

/** Which rule chose the effective default, in plain words (`routed_by`). */
export function routedByFr(t: T, routedBy: string | null | undefined): string {
  const known = (ROUTED_BY as readonly string[]).includes(routedBy ?? '')
  return t(`providerAdmin.common.routedBy.${(known ? routedBy : 'default') as (typeof ROUTED_BY)[number]}`)
}

export const POLICY_MODES = [
  { value: 'off', label: 'providerAdmin.common.policyMode.off', help: 'providerAdmin.common.policyMode.offHelp' },
  { value: 'shadow', label: 'providerAdmin.common.policyMode.shadow', help: 'providerAdmin.common.policyMode.shadowHelp' },
  { value: 'enforce', label: 'providerAdmin.common.policyMode.enforce', help: 'providerAdmin.common.policyMode.enforceHelp' },
] as const satisfies readonly { value: string; label: MessageKey; help: MessageKey }[]

const POLICY_ROLE_KEYS = {
  chat: 'providerAdmin.common.policyRole.chat',
  'runner.simple': 'providerAdmin.common.policyRole.runner.simple',
  'runner.complex': 'providerAdmin.common.policyRole.runner.complex',
  'runner.creative': 'providerAdmin.common.policyRole.runner.creative',
  'runner.retry': 'providerAdmin.common.policyRole.runner.retry',
  'utility.feature_graph': 'providerAdmin.common.policyRole.utility.feature_graph',
  'utility.compaction': 'providerAdmin.common.policyRole.utility.compaction',
} as const satisfies Record<string, MessageKey>

export function policyRoleLabel(t: T, role: string): string {
  return role in POLICY_ROLE_KEYS ? t(POLICY_ROLE_KEYS[role as keyof typeof POLICY_ROLE_KEYS]) : role
}

/** "tools: yes · 131,072 tokens" when known. */
export function modelCapabilities(tr: Pick<Translator, 't' | 'number'>, m: ProviderModel | undefined): string | null {
  const c = m?.capabilities
  if (!c) return null
  const parts: string[] = []
  if (typeof c.tools === 'boolean')
    parts.push(
      tr.t('providerAdmin.common.capabilities.tools', {
        value: tr.t(c.tools ? 'providerAdmin.common.capabilities.yes' : 'providerAdmin.common.capabilities.no'),
      }),
    )
  if (c.context_window?.value)
    parts.push(tr.t('providerAdmin.common.capabilities.tokens', { n: c.context_window.value }))
  return parts.length ? parts.join(' · ') : null
}

/** A credential reference in words: « Vault: deepseek », « Variable: DEEPSEEK_API_KEY », « none ». */
export function credentialLabelFr(t: T, ref: string | null | undefined): string {
  if (!ref || ref === 'none') return t('providerAdmin.common.credential.none')
  if (ref.startsWith('vault:')) return t('providerAdmin.common.credential.vault', { name: ref.slice(6) })
  if (ref.startsWith('env:')) return t('providerAdmin.common.credential.env', { name: ref.slice(4) })
  return ref
}
