// ============================================================================
// PROVIDERS — the one module for provider-facing strings of the composer
// ============================================================================
//
// Which instance a new conversation opens on, why an instance cannot be
// picked, where the default comes from. Kind labels live with the types
// (`providerKindLabel` in `types/provider.ts`).

import type { ModelAlias, ProviderHealthStatus, ProviderInstance, RoutedBy } from '@/types/provider'

/** Shown where a model would be named and the server named none. Never an invented id. */
export const DEFAULT_MODEL_LABEL = 'Default model'

export const PROVIDER_LOCKED_TEXT = 'A conversation stays on its provider'
export const NEW_CONVERSATION_OTHER_PROVIDER_LABEL = 'New conversation with another provider'
export const SET_MODEL_UNSUPPORTED_TEXT =
  'This provider cannot change the model of a running conversation. Start a new conversation to use another model.'

export const PROVIDER_SIGN_IN_REQUIRED_TEXT = 'Sign-in required'
export const PROVIDER_NOT_ALLOWED_TEXT = 'Not allowed for this project'
export const PROVIDER_UNAVAILABLE_TEXT = 'Unavailable'

const ROUTED_BY_LABELS: Readonly<Record<string, string>> = {
  session: 'session default',
  request: 'requested',
  task: 'task default',
  persona: 'persona default',
  run: 'run default',
  project_rule: 'project default',
  global_rule: 'global default',
  configured_default: 'server default',
  claude_code_fallback: 'fallback',
}

/** Which rule made an instance the default, in words. An unknown rule is still "default". */
export function routedByLabel(routedBy: RoutedBy | null | undefined): string {
  return (routedBy && ROUTED_BY_LABELS[routedBy]) || 'default'
}

/**
 * Health → Tailwind dot color. Literal classes only: Tailwind emits a utility
 * only when it appears verbatim in a scanned source file.
 */
const HEALTH_DOT_COLORS: Readonly<Record<ProviderHealthStatus, string>> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  unhealthy: 'bg-red-400',
  auth_required: 'bg-amber-400',
  unknown: 'bg-gray-500',
}

const HEALTH_LABELS: Readonly<Record<ProviderHealthStatus, string>> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unhealthy: 'Unhealthy',
  auth_required: 'Sign-in required',
  unknown: 'Not checked',
}

export function healthDotColor(status: string | null | undefined): string {
  return (HEALTH_DOT_COLORS as Record<string, string>)[status ?? ''] ?? HEALTH_DOT_COLORS.unknown
}

export function healthLabel(status: string | null | undefined): string {
  return (HEALTH_LABELS as Record<string, string>)[status ?? ''] ?? HEALTH_LABELS.unknown
}

/**
 * Why a new conversation cannot open on this instance, or `null` when it can.
 *
 * The project's consent comes first: it is the reason the user can act on from
 * here, and a healthy endpoint the project may not use is still unusable.
 * `degraded` and `unknown` stay selectable — the server decides when asked.
 */
export function providerUnavailableReason(instance: ProviderInstance): string | null {
  if (instance.allowed_for_project === false) return PROVIDER_NOT_ALLOWED_TEXT
  const health = instance.health
  if (health?.status === 'auth_required') return PROVIDER_SIGN_IN_REQUIRED_TEXT
  if (health?.status === 'unhealthy') return health.error?.message || PROVIDER_UNAVAILABLE_TEXT
  return null
}

/** Logical names first, in the order they are usually reasoned about; the rest alphabetically. */
const ALIAS_ORDER = ['fast', 'default', 'deep', 'utility']

export interface InstanceAlias {
  alias: string
  /** Model id the alias points at. */
  model: string
}

/**
 * Aliases usable on one instance: the server's alias table filtered on the
 * instance, plus the aliases its models declare. The table wins on conflict.
 */
export function aliasesForInstance(
  instance: ProviderInstance | null | undefined,
  table: readonly ModelAlias[] | null | undefined,
): InstanceAlias[] {
  if (!instance) return []
  const byName = new Map<string, string>()
  for (const entry of table ?? []) {
    if (entry.provider === instance.id && entry.alias && !byName.has(entry.alias)) byName.set(entry.alias, entry.model)
  }
  for (const model of instance.models ?? []) {
    for (const alias of model.aliases ?? []) {
      if (alias && !byName.has(alias)) byName.set(alias, model.id)
    }
  }
  const rank = (alias: string) => {
    const i = ALIAS_ORDER.indexOf(alias)
    return i === -1 ? ALIAS_ORDER.length : i
  }
  return [...byName.entries()]
    .map(([alias, model]) => ({ alias, model }))
    .sort((a, b) => rank(a.alias) - rank(b.alias) || a.alias.localeCompare(b.alias))
}

/** How a model of a NON-Claude instance is named: its label, else its id as is. */
export function providerModelLabel(instance: ProviderInstance | null | undefined, modelId: string): string {
  return instance?.models?.find((m) => m.id === modelId)?.label || modelId
}
