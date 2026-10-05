import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import { ProviderBadge } from '@/components/chat/ProviderBadge'
import { describeSessionProvider } from '@/constants/providers'
import { describeExecutionRouting } from '@/constants/runProviders'
import type { AgentExecution } from '@/types'

type RoutingFields = Pick<
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

interface ExecutionModelProps {
  execution: RoutingFields
  /** One line (agent cards) instead of one line per fact. */
  compact?: boolean
}

/** Does the record say anything about where it ran? (A caller drops its separator when not.) */
export function hasExecutionRouting(execution: RoutingFields): boolean {
  const routing = describeExecutionRouting(execution)
  return !!(execution.provider_id || routing.ran || routing.chosenBy || routing.shadow)
}

/**
 * Where an execution ran: provider and model that actually served it, and —
 * only when they differ — what was asked for and why it changed; which rule
 * chose; what a shadow policy would have used. A record with none of these
 * (a pre-provider backend) renders nothing.
 */
export function ExecutionModel({ execution, compact = false }: ExecutionModelProps) {
  const providers = useAtomValue(providersAtom)?.providers ?? null
  const routing = describeExecutionRouting(execution)
  if (!hasExecutionRouting(execution)) return null

  const description = describeSessionProvider({ id: execution.provider_id }, providers)
  const facts: string[] = []
  if (routing.requestedInstead && routing.ran) {
    facts.push(`requested ${routing.requestedInstead} → ran ${routing.ran}${routing.reason ? ` (${routing.reason})` : ''}`)
  }
  if (routing.chosenBy) facts.push(`chosen by ${routing.chosenBy}`)
  if (routing.retry) facts.push(`attempt ${routing.retry}`)
  if (routing.shadow) facts.push(`shadow: would have used ${routing.shadow}`)

  return (
    <span data-testid="execution-model" className={compact ? 'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5' : 'flex flex-wrap items-center gap-x-2 gap-y-1'}>
      <ProviderBadge description={description} model={routing.ran} />
      {facts.map((f) => (
        <span key={f} className="text-[11px] text-gray-500">
          {f}
        </span>
      ))}
    </span>
  )
}
