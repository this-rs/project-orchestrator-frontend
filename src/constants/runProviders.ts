// ============================================================================
// RUN PROVIDERS — strings and rules of "which provider/model does this run use"
// ============================================================================
//
// Launching a plan run, the per-task model alias, and what an execution says
// about where it ran. Composer-side strings live in `constants/providers.ts`.

import { isClaudeCodeProvider, type CostBasis, type ProviderInstance, type ResolvedDefault } from '@/types/provider'
import type { AgentExecution } from '@/types'
import { providerModelLabel, routedByLabel } from './providers'
import { tr } from '@/i18n/lazy'

export const runTargetLabel = (): string => tr('providers.run.target')
export const runTargetDefaultModel = (): string => tr('providers.run.defaultModel')
export const runTargetConsentLink = (): string => tr('providers.run.consentLink')
export const runTargetThirdPartyText = (): string => tr('providers.run.thirdParty')
export const runTargetNoPriceText = (): string => tr('providers.run.noPrice')

export const RUN_BUDGET_USD_DISABLED_ID = 'run-budget-usd-disabled'
export const runBudgetTokensLabel = (): string => tr('providers.run.tokensBudget')
export const runBudgetTokensHelp = (): string => tr('providers.run.tokensBudgetHelp')

export const taskModelAliasLabel = (): string => tr('providers.run.modelAlias')
export const taskModelAliasInherit = (): string => tr('providers.run.modelAliasInherit')
export const taskModelAliasHelp = (): string => tr('providers.run.modelAliasHelp')

/** Label of the "nothing chosen" option: the server default, and which rule made it the default. */
export function serverDefaultLabel(
  providers: readonly ProviderInstance[],
  resolved: ResolvedDefault | null | undefined,
): string {
  if (!resolved) return tr('providers.run.serverDefault')
  const label = providers.find((p) => p.id === resolved.provider)?.label || resolved.provider
  return tr('providers.run.serverDefaultWith', { provider: label, rule: routedByLabel(resolved.routed_by) })
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

const FALLBACK_REASON_KEYS = {
  provider_unavailable: 'providers.run.reason.provider_unavailable',
  rate_limited: 'providers.run.reason.rate_limited',
  context_too_long: 'providers.run.reason.context_too_long',
  budget: 'providers.run.reason.budget',
  fallback: 'providers.run.reason.fallback',
} as const

/** What an execution record says about where it ran — nothing invented for fields it lacks. */
export function describeExecutionRouting(exec: Pick<
  AgentExecution,
  'model' | 'model_requested' | 'model_alias' | 'routed_by' | 'route_rule' | 'fallback_reason' | 'shadow_model' | 'attempt'
>): ExecutionRouting {
  const ran = exec.model || null
  const requested = exec.model_requested || exec.model_alias || null
  const differs = !!ran && !!requested && requested !== ran
  const rawReason = exec.fallback_reason || null
  const reason = rawReason
    ? rawReason in FALLBACK_REASON_KEYS
      ? tr(FALLBACK_REASON_KEYS[rawReason as keyof typeof FALLBACK_REASON_KEYS])
      : rawReason.replace(/_/g, ' ')
    : null
  const chosenBy = exec.route_rule
    ? tr('providers.run.rule', { rule: exec.route_rule })
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

export type RoutingFields = Pick<
  AgentExecution,
  | 'provider_id'
  | 'model'
  | 'model_requested'
  | 'model_alias'
  | 'routed_by'
  | 'route_rule'
  | 'fallback_reason'
  | 'shadow_model'
  | 'attempt'
>

/** Does the record say anything about where it ran? (A caller drops its separator when not.) */
export function hasExecutionRouting(execution: RoutingFields): boolean {
  const routing = describeExecutionRouting(execution)
  return !!(execution.provider_id || routing.ran || routing.chosenBy || routing.shadow)
}
