// ============================================================================
// RUN PROVIDERS — strings and rules of "which provider/model does this run use"
// ============================================================================
//
// Launching a plan run, the per-task model alias, and what an execution says
// about where it ran. Composer-side strings live in `constants/providers.ts`.

import { isClaudeCodeProvider, type CostBasis, type ProviderInstance, type ResolvedDefault } from '@/types/provider'
import type { AgentExecution } from '@/types'
import { providerModelLabel, routedByLabel } from './providers'

export const RUN_TARGET_LABEL = 'Provider / model'
export const RUN_TARGET_DEFAULT_MODEL = 'Provider default model'
export const RUN_TARGET_CONSENT_LINK = 'Allow this project in provider settings'
export const RUN_TARGET_THIRD_PARTY_TEXT =
  'Runs on a third-party provider: tools ask for approval or follow a restricted profile. A run on this provider never bypasses permissions.'
export const RUN_TARGET_NO_PRICE_TEXT =
  'This provider has no known price, so a budget in USD could never trigger. Set a token budget instead.'

export const RUN_BUDGET_USD_DISABLED_ID = 'run-budget-usd-disabled'
export const RUN_BUDGET_TOKENS_LABEL = 'Token budget'
export const RUN_BUDGET_TOKENS_HELP = 'Execution stops when input and output tokens reach this limit.'

export const TASK_MODEL_ALIAS_LABEL = 'Model alias'
export const TASK_MODEL_ALIAS_INHERIT = 'Inherit (no override)'
export const TASK_MODEL_ALIAS_HELP = 'Which model this task runs on. Empty: it inherits the run, project or server default.'

/** Label of the "nothing chosen" option: the server default, and which rule made it the default. */
export function serverDefaultLabel(
  providers: readonly ProviderInstance[],
  resolved: ResolvedDefault | null | undefined,
): string {
  if (!resolved) return 'Server default'
  const label = providers.find((p) => p.id === resolved.provider)?.label || resolved.provider
  return `Server default (${label}, ${routedByLabel(resolved.routed_by)})`
}

/**
 * Does the instance have a price a USD budget can be measured against?
 * Only a `reported` or `priced` cost source does; `free`, `subscription` and
 * `unknown` never produce a dollar figure. An instance that says nothing is
 * priced only if it is Claude Code (its cost has always been reported).
 */
export function hasKnownPrice(instance: ProviderInstance | null | undefined): boolean {
  if (!instance) return true
  const source: CostBasis | null | undefined = instance.cost_source
  if (source) return source === 'reported' || source === 'priced'
  return isClaudeCodeProvider(instance.id, instance.kind)
}

export function isThirdParty(instance: ProviderInstance | null | undefined): boolean {
  return !!instance && !isClaudeCodeProvider(instance.id, instance.kind)
}

/** How an execution's model is named: the instance label for a third party, the id as is otherwise. */
export function executionModelLabel(instance: ProviderInstance | null | undefined, model: string): string {
  return instance ? providerModelLabel(instance, model) : model
}

export interface ExecutionRouting {
  /** The model that ran, if the record says. */
  ran: string | null
  /** The requested model, only when it is not the one that ran. */
  requestedInstead: string | null
  /** Why they differ, in words (`fallback_reason`, else a rule). */
  reason: string | null
  /** The rule that chose, in words. */
  chosenBy: string | null
  /** What shadow routing would have used (only when different from what ran). */
  shadow: string | null
  retry: number | null
}

const FALLBACK_REASON_LABELS: Readonly<Record<string, string>> = {
  provider_unavailable: 'provider unavailable',
  rate_limited: 'rate limited',
  context_too_long: 'context too long',
  budget: 'budget',
  fallback: 'fallback',
}

/** What an execution record says about where it ran — nothing invented for fields it lacks. */
export function describeExecutionRouting(exec: Pick<
  AgentExecution,
  'model' | 'model_requested' | 'model_alias' | 'routed_by' | 'route_rule' | 'fallback_reason' | 'shadow_model' | 'attempt'
>): ExecutionRouting {
  const ran = exec.model || null
  const requested = exec.model_requested || exec.model_alias || null
  const differs = !!ran && !!requested && requested !== ran
  const rawReason = exec.fallback_reason || null
  const reason = rawReason ? FALLBACK_REASON_LABELS[rawReason] ?? rawReason.replace(/_/g, ' ') : null
  const chosenBy = exec.route_rule
    ? `rule ${exec.route_rule}`
    : exec.routed_by
      ? routedByLabel(exec.routed_by)
      : null
  const shadow = exec.shadow_model && exec.shadow_model !== ran ? exec.shadow_model : null
  return {
    ran,
    requestedInstead: differs ? requested : null,
    reason: differs ? reason : null,
    chosenBy,
    shadow,
    retry: exec.attempt && exec.attempt > 1 ? exec.attempt : null,
  }
}
