import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'
import { ProviderBadge } from '@/components/chat/ProviderBadge'
import { describeSessionProvider } from '@/constants/providers'
import { describeExecutionRouting, hasExecutionRouting, type RoutingFields } from '@/constants/runProviders'

interface ExecutionModelProps {
  execution: RoutingFields
  /** One line (agent cards) instead of one line per fact. */
  compact?: boolean
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
