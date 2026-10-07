// ============================================================================
// ROUTING — how a provider/model is chosen for a session (`/api/chat/routing`)
// ============================================================================
//
// Three modes × one learning stage, set globally and overridable per project.
// Everything here mirrors the backend's `cognitive` module field for field;
// names are FIXED by the contract (`__fixtures__/chat-contract/provider-additions.json`).
//
// The type is called `ProviderRoutingMode`, not `RoutingMode`: that name is
// already taken by the neural routing page (`services/neuralRouting.ts`).

import type { ProviderId } from './provider'

/**
 * - `primary` — one exclusive primary provider: the current behaviour. PO only
 *   records what it would have chosen.
 * - `mixed` — the primary pilots the conversation; PO routes the executor
 *   sessions (runner, delegations, utilities).
 * - `full` — PO chooses everything, pilot included, and says why.
 */
export const ROUTING_MODES = ['primary', 'mixed', 'full'] as const
export type ProviderRoutingMode = (typeof ROUTING_MODES)[number]

/**
 * - `shadow` — nothing is applied, every decision is recorded (default).
 * - `advisory` — PO suggests; the human confirms.
 * - `auto` — PO applies its decisions; it demotes itself to shadow when a
 *   learned arm falls below the declarative choice of the same class.
 */
export const LEARNING_STAGES = ['shadow', 'advisory', 'auto'] as const
export type LearningStage = (typeof LEARNING_STAGES)[number]

/** Where a GET answer comes from: the global setting, a project override, or the built-in default. */
export type RoutingScope = 'global' | 'project' | 'default'
export const ROUTING_SCOPES = ['global', 'project', 'default'] as const satisfies readonly RoutingScope[]

export function toProviderRoutingMode(value: unknown): ProviderRoutingMode | null {
  return typeof value === 'string' && (ROUTING_MODES as readonly string[]).includes(value) ? (value as ProviderRoutingMode) : null
}

export function toLearningStage(value: unknown): LearningStage | null {
  return typeof value === 'string' && (LEARNING_STAGES as readonly string[]).includes(value) ? (value as LearningStage) : null
}

export function toRoutingScope(value: unknown): RoutingScope | null {
  return typeof value === 'string' && (ROUTING_SCOPES as readonly string[]).includes(value) ? (value as RoutingScope) : null
}

/** The primary provider of `primary` / `mixed` mode. `model` and `alias` are exclusive. */
export interface RoutingPrimary {
  provider: ProviderId
  model?: string | null
  alias?: string | null
}

/** Body of `PUT /api/chat/routing` and `PUT /api/projects/{slug}/routing`. */
export interface RoutingSettings {
  mode: ProviderRoutingMode
  stage: LearningStage
  /** `null` = let the resolver pick (server default / roles). */
  primary: RoutingPrimary | null
  /** Bounded exploration rate of the bandit, in [0, 1]. */
  exploration_epsilon: number
  /** Weight of the normalised cost in the utility. */
  cost_weight: number
  /** Weight of the normalised latency in the utility. */
  latency_weight: number
  /** Window (decisions) after which a losing learned arm demotes the stage back to shadow. */
  demote_after: number
}

/** What a GET answers: the settings plus where they come from. */
export interface RoutingSettingsResponse extends RoutingSettings {
  scope: RoutingScope
}

/** `GET /api/chat/providers` → `routing`: the mode in force, in one glance. */
export interface RoutingSummary {
  mode: ProviderRoutingMode
  stage: LearningStage
  scope: RoutingScope
}

/** Why a candidate was NOT chosen (hard filters of `candidates.rs`). Open-ended: an unknown reason still renders. */
export type KnownRoutingRejection =
  | 'not_allowed'
  | 'unhealthy'
  | 'no_tools'
  | 'context_too_small'
  | 'no_images'
  | 'over_budget'
  | 'trust_without_sandbox'
  | 'remote'
export const ROUTING_REJECTIONS: readonly KnownRoutingRejection[] = [
  'not_allowed',
  'unhealthy',
  'no_tools',
  'context_too_small',
  'no_images',
  'over_budget',
  'trust_without_sandbox',
  'remote',
]
export type RoutingRejection = KnownRoutingRejection | (string & {})

export interface RoutingAlternative {
  provider_id: ProviderId
  model: string | null
  /** `null` = filtered out before scoring. */
  score: number | null
  /** Rejection reason, `null` when the candidate was merely outscored. */
  rejected: RoutingRejection | null
}

/** What happened after the decision. Every unknown figure is `null`, never 0. */
export interface RoutingOutcome {
  success: boolean | null
  /** Reward in [0, 1]. */
  reward: number | null
  cost_usd: number | null
}

/** One `(:RoutingDecision)` — `GET /api/chat/routing/decisions`. */
export interface RoutingDecision {
  id: string
  /** RFC 3339. */
  at: string
  mode: ProviderRoutingMode
  stage: LearningStage
  /** `false` in shadow / advisory: the choice was recorded, not applied. */
  applied: boolean
  /** `simple | complex | creative | retry | utility | chat` — open-ended. */
  task_class: string
  provider_id: ProviderId
  model: string | null
  score: number | null
  /** The bandit explored instead of exploiting. */
  explored: boolean
  /** Human-readable reason, from the backend. */
  reason: string
  alternatives: RoutingAlternative[]
  session_id?: string | null
  task_id?: string | null
  run_id?: string | null
  outcome?: RoutingOutcome | null
}

export interface RoutingDecisionsParams {
  project_slug?: string
  limit?: number
  offset?: number
}

export interface RoutingReportParams {
  project_slug?: string
  /** RFC 3339 bounds. */
  from?: string
  to?: string
}

export interface RoutingReportByClass {
  task_class: string
  decisions: number
  applied: number
  /** Shadow choice == real choice, in [0, 1]; `null` without comparable decisions. */
  agreement_rate: number | null
  /** ESTIMATED: cost bases are never mixed; `null` when a price is unknown. */
  estimated_cost_delta_usd: number | null
}

export interface RoutingReportByArm {
  task_class: string
  provider_id: ProviderId
  model: string | null
  /** Pulls of the arm. */
  n: number
  mean_reward: number | null
  mean_cost_usd: number | null
}

/** `GET /api/chat/routing/report` — the shadow report. */
export interface RoutingReport {
  decisions: number
  applied: number
  agreement_rate: number | null
  estimated_cost_delta_usd: number | null
  by_class: RoutingReportByClass[]
  by_arm: RoutingReportByArm[]
}

/** 400 codes of the routing settings routes (403 for an agent token carries no code). */
export type RoutingErrorCode = 'invalid_routing_mode' | 'invalid_learning_stage' | 'invalid_routing_weight'
export const ROUTING_ERROR_CODES: readonly RoutingErrorCode[] = [
  'invalid_routing_mode',
  'invalid_learning_stage',
  'invalid_routing_weight',
]
