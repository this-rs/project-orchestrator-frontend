import { useSessionUsage } from '@/hooks/useSessionUsage'
import { useT } from '@/i18n'
import { formatRatio } from '@/utils/cost'

interface SessionUsageSummaryProps {
  sessionId: string | null
  isStreaming: boolean
}

/**
 * The conversation's prompt-cache share, from the backend's own total
 * (`GET /api/chat/sessions/{id}/usage`, CTX0-FE) — never summed here from the
 * turns the transcript happens to hold. Nothing at all until a turn reported a
 * usage: a ratio over turns that said nothing would be invented.
 */
export function SessionUsageSummary({ sessionId, isStreaming }: SessionUsageSummaryProps) {
  const { t } = useT()
  const usage = useSessionUsage(sessionId, isStreaming)
  if (!usage || usage.turns_with_usage === 0) return null
  const ratio = usage.cache_hit_ratio
  const text = typeof ratio === 'number'
    ? t('ui.cost.sessionCache', { ratio: formatRatio(ratio) })
    : t('ui.cost.sessionCacheNone')
  const title = t('ui.cost.sessionCacheTitle', { with: usage.turns_with_usage, turns: usage.turns })
  return (
    <span
      data-testid="session-usage-summary"
      title={title}
      className="mr-auto truncate text-[11px] leading-5 text-gray-500 tabular-nums"
    >
      {text}
      <span className="sr-only"> ({title})</span>
    </span>
  )
}
