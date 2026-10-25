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
 * The SETTINGS' mode (global or project document, `RoutingSettings.mode`):
 * - `primary` — one exclusive primary provider: the current behaviour. PO only
 *   records what it would have chosen.
 * - `executors_only` — the primary pilots the conversation; PO routes the executor
 *   sessions only (runner, delegations, utilities). Named `mixed` before decision
 *   R-S4: a server or a document that still says `mixed` is read as this one.
 * - `full` — PO chooses everything, pilot included, and says why.
 *
 * Not to be confused with {@link ConversationRoutingMode}, the menu's choice for ONE
 * conversation, where `mixed` means "PO routes among the models I ticked".
 */
export const ROUTING_MODES = ['primary', 'executors_only', 'full'] as const
export type ProviderRoutingMode = (typeof ROUTING_MODES)[number]

/** The name a server older than decision R-S4 gives `executors_only` in the settings. */
export const LEGACY_EXECUTORS_ONLY = 'mixed'

/**
 * The mode of ONE conversation (`ChatSession.routing_mode`, `CreateSessionRequest.routing_mode`),
 * derived from the chat menu, never stored in the settings:
 * - `full` — Auto: PO routes everything, the provider included;
 * - `mixed` — two models ticked or more: PO routes among them, the opening model included
 *   (the "pilot" the menu names is only a fallback);
 * - `primary` — one model ticked: strict, never substituted.
 */
export const CONVERSATION_ROUTING_MODES = ['primary', 'mixed', 'full'] as const
export type ConversationRoutingMode = (typeof CONVERSATION_ROUTING_MODES)[number]

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

/** The settings' mode of a server answer; `mixed` (a server older than R-S4) is `executors_only`. */
export function toProviderRoutingMode(value: unknown): ProviderRoutingMode | null {
  if (value === LEGACY_EXECUTORS_ONLY) return 'executors_only'
  return typeof value === 'string' && (ROUTING_MODES as readonly string[]).includes(value) ? (value as ProviderRoutingMode) : null
}

/** A conversation's mode as its record says it; anything else is `null` (the settings decided). */
export function toConversationRoutingMode(value: unknown): ConversationRoutingMode | null {
  return typeof value === 'string' && (CONVERSATION_ROUTING_MODES as readonly string[]).includes(value) ? (value as ConversationRoutingMode) : null
}

/**
 * What the settings' mode means for a conversation that chose nothing: `full` routes it;
 * `executors_only` and `primary` leave its pilot alone, i.e. `primary` for the conversation.
 */
export function conversationModeOfSettings(mode: ProviderRoutingMode): ConversationRoutingMode {
  return mode === 'full' ? 'full' : 'primary'
}

/**
 * `auto` as a model id is the server's sentinel for "PO decides", never a model name
 * (backend `is_auto_model`: trimmed, case-insensitive).
 */
export function isAutoModelSentinel(model: string | null | undefined): boolean {
  return typeof model === 'string' && model.trim().toLowerCase() === 'auto'
}

/**
 * The mode a conversation that chose nothing in the menu opens in, as the server applies it:
 * `full` when the server's default model is the `auto` sentinel (`chat.default_model: auto` is
 * the operator's standing choice of Auto for every pilot that names nothing — the backend reads
 * such an opening as `routing_mode: full`), else the settings' mode, else `primary`.
 */
export function conversationModeOfServer(settingsMode: ProviderRoutingMode | null | undefined, serverDefaultModel: string | null | undefined): ConversationRoutingMode {
  if (isAutoModelSentinel(serverDefaultModel)) return 'full'
  return settingsMode ? conversationModeOfSettings(settingsMode) : 'primary'
}

export function toLearningStage(value: unknown): LearningStage | null {
  return typeof value === 'string' && (LEARNING_STAGES as readonly string[]).includes(value) ? (value as LearningStage) : null
}

export function toRoutingScope(value: unknown): RoutingScope | null {
  return typeof value === 'string' && (ROUTING_SCOPES as readonly string[]).includes(value) ? (value as RoutingScope) : null
}

/** The primary provider of `primary` / `executors_only` mode. `model` and `alias` are exclusive. */
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
  | 'window_unknown'
export const ROUTING_REJECTIONS: readonly KnownRoutingRejection[] = [
  'not_allowed',
  'unhealthy',
  'no_tools',
  'context_too_small',
  'no_images',
  'over_budget',
  'trust_without_sandbox',
  'remote',
  'window_unknown',
]
export type RoutingRejection = KnownRoutingRejection | (string & {})

/**
 * Why a `window_unknown` rejection has no window (backend #649,
 * `UnknownWindow`): the live model catalog is offline, or does not list the
 * model with a window. Open-ended like the codes.
 */
export type UnknownWindowCause = 'catalog_offline' | 'not_in_catalog' | (string & {})

export interface RoutingAlternative {
  provider_id: ProviderId
  model: string | null
  /** `null` = filtered out before scoring. */
  score: number | null
  /** Rejection reason, `null` when the candidate was merely outscored. */
  rejected: RoutingRejection | null
  /**
   * Cause of a `window_unknown` rejection (`RejectReason::WindowUnknown.why`),
   * when the server sends it. Absent: the label without a cause.
   */
  why?: UnknownWindowCause | null
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
