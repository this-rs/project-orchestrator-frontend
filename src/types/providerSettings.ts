// ============================================================================
// PROVIDER SETTINGS — wire shapes of the routes behind the settings page
// ============================================================================
//
// None of these routes existed on the backend when the page was written: the
// shapes below are what the interface was coded against (see
// `services/providers.ts`). A secret VALUE never appears in any of them, only
// a reference (`vault:<name>`, `env:<VAR>`, `none`).

import type { CostBasis, CredentialRef, ProviderHealth, ProviderId, ProviderPreset } from './provider'

/**
 * Body of `POST /chat/providers/test` and `POST /chat/providers`. References only.
 *
 * `kind` is the set the backend accepts (`record_from_draft`): a `codex` or
 * `acp` instance has no `base_url` (empty), and an `acp` one names, with
 * `preset`, an agent declared on the server (`CHAT_PROVIDER_ACP_COMMANDS`).
 */
export interface ProviderDraft {
  id: ProviderId
  kind: 'openai_compatible' | 'codex' | 'acp'
  preset?: ProviderPreset | 'opencode' | null
  label: string
  base_url: string
  default_model?: string | null
  cost_source: CostBasis
  credential_ref: CredentialRef
}

/** Body of `PUT /chat/providers/{id}`: the id never changes. */
export type ProviderPatch = Partial<Omit<ProviderDraft, 'id' | 'kind'>>

/** Answer of `POST /chat/providers/test`. */
export interface ProviderTestResult {
  ok: boolean
  health: ProviderHealth
  models?: { id: string; label?: string }[]
  probe?: { tools: boolean; context_window?: number }
}

/** One row of `GET /projects/{slug}/llm-consent`. */
export interface LlmConsent {
  provider_id: ProviderId
  /** Origin the consent was given for. */
  origin: string
  consented_by: string
  consented_at: string
  /** `false` = the instance's origin changed since: the consent no longer holds. */
  valid: boolean
}

export interface RoleTarget {
  provider: ProviderId
  model?: string
  alias?: string
}

/** `pilot` = sessions opened by a human; `executor` = runner, delegations, protocols, one-shot. */
export type ProviderRole = 'pilot' | 'executor'
export const PROVIDER_ROLES: readonly ProviderRole[] = ['pilot', 'executor']

/** `GET/PUT /chat/roles` and `GET/PUT /projects/{slug}/llm-roles`. An absent role = not set. */
export type RoleAssignments = Partial<Record<ProviderRole, RoleTarget>>

export type ModelPolicyMode = 'off' | 'shadow' | 'enforce'

export const POLICY_RULE_ROLES = [
  'chat',
  'runner.simple',
  'runner.complex',
  'runner.creative',
  'runner.retry',
  'utility.feature_graph',
  'utility.compaction',
] as const
export type PolicyRuleRole = (typeof POLICY_RULE_ROLES)[number]

export interface ModelPolicyCaps {
  per_task_usd?: number | null
  per_run_usd?: number | null
  per_task_tokens?: number | null
  per_run_tokens?: number | null
}

/** `GET/PUT /chat/model-policy`. */
export interface ModelPolicy {
  mode: ModelPolicyMode
  /** Rule role → alias. */
  rules: Record<string, string>
  /** Aliases, in the order they are tried. */
  fallback: string[]
  caps: ModelPolicyCaps
}
