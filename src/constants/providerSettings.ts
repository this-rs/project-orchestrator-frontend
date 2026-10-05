// ============================================================================
// PROVIDER SETTINGS — the one module for the strings of the settings page
// ============================================================================

import { ApiError, apiErrorMessage } from '@/services/api'
import { toProviderError } from '@/services/providers'
import { providerErrorExplanation } from './providerErrors'
import type { CostBasis, CredentialRef } from '@/types/provider'

export const SETTINGS_FORBIDDEN_TEXT = 'Only a signed-in user can change this'

export const UNSUPPORTED_TITLE = 'This server runs a single provider'
export const UNSUPPORTED_TEXT =
  'This server only handles one provider: Claude Code. There is nothing to configure here, and every conversation runs on Claude Code.'

export const NO_PROJECT_TEXT =
  'A conversation without a project can only use Claude Code: no project content is sent anywhere else.'

export const SINGLE_PROVIDER_ROLES_TEXT = 'single provider (current behaviour)'

export const ROLE_LABELS = {
  pilot: 'Pilot',
  executor: 'Executor',
} as const
export const ROLE_HELP = {
  pilot: 'Conversations opened by a person.',
  executor: 'The runner, delegations, protocols and one-shot calls.',
} as const

export const RESOLUTION_ORDER_TEXT =
  'Resolution order: the request, then the task, the project role, the global role, then the server default.'

export const POLICY_SHADOW_TEXT = 'Computed and recorded, not applied'
export const POLICY_FALLBACK_RULES_TEXT =
  'A fallback never reaches an endpoint the project has not agreed to, and never replaces a model somebody chose explicitly.'
export const POLICY_USD_CAP_HELP =
  'A budget in USD needs a price. A run with a USD budget is refused when its model has none, so only models with a known price can be capped in dollars; the others are capped in tokens.'

export const POLICY_ROLE_LABELS: Readonly<Record<string, string>> = {
  chat: 'Chat',
  'runner.simple': 'Runner, simple task',
  'runner.complex': 'Runner, complex task',
  'runner.creative': 'Runner, creative task',
  'runner.retry': 'Runner, retry',
  'utility.feature_graph': 'Feature graph',
  'utility.compaction': 'Compaction',
}

export const COST_BASIS_LABELS: Readonly<Record<CostBasis, string>> = {
  reported: 'Reported by the provider',
  priced: 'Priced (estimate)',
  free: 'Free (local)',
  subscription: 'Subscription',
  unknown: 'Unknown',
}

/** Cost bases that carry a dollar price, and so can be capped in USD. */
export function hasUsdPrice(cost: CostBasis | null | undefined): boolean {
  return cost === 'reported' || cost === 'priced'
}

export function credentialLabel(ref: CredentialRef | null | undefined): string {
  return ref || 'none'
}

/** `localhost`, `127.0.0.1`, `::1`: plain http is acceptable there only. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

/** Origin (scheme://host:port) of a URL, or `null` when it is not a URL. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.origin === 'null' ? null : u.origin
  } catch {
    return null
  }
}

/** What to tell the user about a failed settings call. A 403 is the human-token rule of the server. */
export function settingsErrorMessage(err: unknown): string {
  // A typed code (security gate, origin mismatch, endpoint refusals) says more than a bare 403.
  const typed = toProviderError(err)
  if (typed) return providerErrorExplanation(typed)
  if (err instanceof ApiError && err.status === 403) return SETTINGS_FORBIDDEN_TEXT
  return apiErrorMessage(err, 'The request failed')
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** URL problem of a base URL, or `null`. https is required except on a loopback host. */
export function validateBaseUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return 'The base URL is required.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'This is not a valid URL.'
  }
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return null
  return 'Use https. Plain http is only accepted for localhost, 127.0.0.1 and ::1.'
}

export const PROVIDER_SECTIONS = [
  { id: 'instances', title: 'Instances' },
  { id: 'consent', title: 'Project consent' },
  { id: 'roles', title: 'Roles' },
  { id: 'models', title: 'Models and policy' },
] as const
