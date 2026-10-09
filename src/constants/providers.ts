// ============================================================================
// PROVIDERS — the one module for provider-facing strings of the composer
// ============================================================================
//
// Which instance a new conversation opens on, why an instance cannot be
// picked, where the default comes from. Kind labels live with the types
// (`providerKindLabel` in `types/provider.ts`).

import {
  isClaudeCodeProvider,
  isRemoteClaudeCode,
  providerDisplayName,
  providerKindLabel,
  type ModelAlias,
  type ProviderHealthStatus,
  type ProviderId,
  type ProviderInstance,
  type ProviderKind,
  type RoutedBy,
} from '@/types/provider'
import type { MessageKey } from '@/i18n'
import { tr } from '@/i18n/lazy'

/** Shown where a model would be named and the server named none. Never an invented id. */
export const defaultModelLabel = (): string => tr('providers.defaultModel')

export const providerLockedText = (): string => tr('providers.locked')
export const newConversationOtherProviderLabel = (): string => tr('providers.newConversationOther')
export const setModelUnsupportedText = (): string => tr('providers.setModelUnsupported')

export const providerSignInRequiredText = (): string => tr('providers.signInRequired')
export const providerNotAllowedText = (): string => tr('providers.notAllowed')
export const providerUnavailableText = (): string => tr('providers.unavailable')

const ROUTED_BY_LABEL_KEYS = {
  session: 'providers.routedBy.session',
  request: 'providers.routedBy.request',
  task: 'providers.routedBy.task',
  persona: 'providers.routedBy.persona',
  run: 'providers.routedBy.run',
  project_rule: 'providers.routedBy.project_rule',
  global_rule: 'providers.routedBy.global_rule',
  default: 'providers.routedBy.default',
  claude_code: 'providers.routedBy.claude_code',
  fallback: 'providers.routedBy.fallback',
  auto: 'providers.routedBy.auto',
} as const satisfies Record<string, MessageKey>

/** i18n key of a `routed_by` value (`routing.routedBy.*`); an unknown rule reads as the server default. */
export function routedByKey(routedBy: RoutedBy | null | undefined): MessageKey {
  return (routedBy && routedBy in ROUTED_BY_LABEL_KEYS ? `routing.routedBy.${routedBy}` : 'routing.routedBy.default') as MessageKey
}

/** Which rule made an instance the default, in words. An unknown rule is still "default". */
export function routedByLabel(routedBy: RoutedBy | null | undefined): string {
  return routedBy && routedBy in ROUTED_BY_LABEL_KEYS
    ? tr(ROUTED_BY_LABEL_KEYS[routedBy as keyof typeof ROUTED_BY_LABEL_KEYS])
    : tr('providers.routedBy.fallbackDefault')
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

const HEALTH_LABEL_KEYS: Readonly<Record<ProviderHealthStatus, MessageKey>> = {
  healthy: 'providers.health.healthy',
  degraded: 'providers.health.degraded',
  unhealthy: 'providers.health.unhealthy',
  auth_required: 'providers.health.auth_required',
  unknown: 'providers.health.unknown',
}

export function healthDotColor(status: string | null | undefined): string {
  return (HEALTH_DOT_COLORS as Record<string, string>)[status ?? ''] ?? HEALTH_DOT_COLORS.unknown
}

export function healthLabel(status: string | null | undefined): string {
  return tr((HEALTH_LABEL_KEYS as Record<string, MessageKey>)[status ?? ''] ?? HEALTH_LABEL_KEYS.unknown)
}

/**
 * Why a new conversation cannot open on this instance, or `null` when it can.
 *
 * The project's consent comes first: it is the reason the user can act on from
 * here, and a healthy endpoint the project may not use is still unusable.
 * `degraded` and `unknown` stay selectable — the server decides when asked.
 */
export function providerUnavailableReason(instance: ProviderInstance): string | null {
  if (instance.allowed_for_project === false) return providerNotAllowedText()
  const health = instance.health
  if (health?.status === 'auth_required') return providerSignInRequiredText()
  if (health?.status === 'unhealthy') return health.error?.message || providerUnavailableText()
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

/**
 * The model a (provider, model-or-alias) pick stands for, from the listing: an
 * alias resolves to its model, anything else is itself.
 */
export function pickModelResolver(
  list: { providers: readonly ProviderInstance[]; aliases?: readonly ModelAlias[] | null } | null | undefined,
): (pick: { provider: string; model: string }) => string {
  return (pick) => {
    const instance = list?.providers.find((p) => p.id === pick.provider)
    return aliasesForInstance(instance, list?.aliases).find((a) => a.alias === pick.model)?.model ?? pick.model
  }
}

/** How a model of a NON-Claude instance is named: its label, else its id as is. */
export function providerModelLabel(instance: ProviderInstance | null | undefined, modelId: string): string {
  return instance?.models?.find((m) => m.id === modelId)?.label || modelId
}

// ----------------------------------------------------------------------------
// Which provider a conversation runs on (badge, export)
// ----------------------------------------------------------------------------

export const providerBadgeUnavailableText = (): string => tr('providers.badgeUnavailable')
export const providerBadgeUnavailableHelp = (): string => tr('providers.badgeUnavailableHelp')

/** What a session says about its provider: its record, or its `system_init`. */
export interface SessionProviderRef {
  id?: ProviderId | null
  kind?: ProviderKind | null
  label?: string | null
}

export interface SessionProviderDescription {
  /** Instance label, else the kind, else the raw id. `Claude Code` for a session without provider. */
  label: string
  isClaudeCode: boolean
  /** A Claude Code on another machine (SSH): its label is its id, `claude-code@<name>`. */
  isRemote: boolean
  /** The instance is absent from the LOADED list: it was deleted, the conversation cannot be resumed. */
  unavailable: boolean
}

/**
 * Name the provider of a session.
 *
 * `instances` is the loaded list, or `null` while it is not known (not loaded,
 * or a backend without provider routes): an instance can only be declared
 * missing against a list that was actually read. A session WITHOUT a provider
 * id predates providers — it is Claude Code, and never "unavailable".
 */
export function describeSessionProvider(
  ref: SessionProviderRef | null | undefined,
  instances: readonly ProviderInstance[] | null | undefined,
): SessionProviderDescription {
  const id = ref?.id || null
  if (!id) return { label: providerKindLabel('claude_code'), isClaudeCode: true, isRemote: false, unavailable: false }
  const instance = instances?.find((p) => p.id === id) ?? null
  const kind = ref?.kind ?? instance?.kind ?? null
  const isClaudeCode = isClaudeCodeProvider(id, kind)
  const isRemote = isRemoteClaudeCode(kind)
  // A remote Claude Code is always named by its id, never by a label that could read "Claude Code".
  const label = isRemote
    ? id
    : instance
      ? providerDisplayName(instance)
      : ref?.label || (kind || isClaudeCode ? providerKindLabel(kind) : id)
  return { label, isClaudeCode, isRemote, unavailable: !!instances && !instance && !isClaudeCode }
}

/**
 * A list of conversations that are all Claude Code on a server with a single
 * instance gains nothing from a badge on every row: it is shown only when
 * there is something to tell apart.
 */
export function shouldShowProviderBadge(
  description: SessionProviderDescription,
  instances: readonly ProviderInstance[] | null | undefined,
): boolean {
  return (instances?.length ?? 0) > 1 || !description.isClaudeCode
}

/** The "no explicit choice" target of a new conversation: the server resolves provider and model. */
export const autoTargetLabel = (): string => tr('providers.autoTarget')
export const autoTargetHelp = (): string => tr('providers.autoTargetHelp')
