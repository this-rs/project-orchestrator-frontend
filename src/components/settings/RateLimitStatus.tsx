import { AlertTriangle, CheckCircle2, Clock, HelpCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { describeLimit, formatClock, type RateLimitReport, type RateLimitState } from '@/types/rateLimit'

/**
 * The live state of an instance's limits (RL7).
 *
 * Every pill carries an ICON AND A TEXT — never a colour alone, so the two cases
 * that must never be confused are told apart by reading:
 *
 * - "Limit reached until HH:MM": a quota (ours, or one the provider confirmed).
 *   Nothing is sent until the reset.
 * - "Provider overloaded, next try at HH:MM": the provider is intermittent while
 *   our own count is under the limit. The key is NOT exhausted.
 *
 * Nothing here is a secret: a limit scoped to a credential names its reference.
 * With no limit configured the component renders nothing at all.
 */
export function RateLimitStatus({ report }: { report: RateLimitReport | null }) {
  const { t } = useT()
  if (!report || report.limits.length === 0) return null
  return (
    <div data-testid="rate-limit-status" className="space-y-2">
      <p className="text-sm font-medium text-gray-300">{t('providerAdmin.limits.statusTitle')}</p>
      <ul className="space-y-2">
        {report.limits.map((state, index) => (
          <li key={`${state.kind}-${index}`} data-testid="rate-limit-pill">
            <Pill state={state} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">{t('providerAdmin.limits.statusHelp')}</p>
    </div>
  )
}

function Pill({ state }: { state: RateLimitState }) {
  const { t } = useT()
  const reset = formatClock(state.resets_at)
  const retry = formatClock(state.next_retry_at)
  const { icon, tone, text } = (() => {
    switch (state.status) {
      case 'ok':
        return {
          icon: <CheckCircle2 className="w-4 h-4" aria-hidden />,
          tone: 'text-emerald-300',
          text: t('providerAdmin.limits.statusOk'),
        }
      case 'limited':
        return {
          icon: <Clock className="w-4 h-4" aria-hidden />,
          tone: 'text-amber-300',
          text: reset
            ? t('providerAdmin.limits.statusLimited', { time: reset })
            : t('providerAdmin.limits.statusLimitedOpen'),
        }
      case 'overloaded':
        return {
          icon: <AlertTriangle className="w-4 h-4" aria-hidden />,
          tone: 'text-orange-300',
          text: retry
            ? t('providerAdmin.limits.statusOverloaded', { time: retry })
            : t('providerAdmin.limits.statusOverloadedOpen'),
        }
      default:
        return {
          icon: <HelpCircle className="w-4 h-4" aria-hidden />,
          tone: 'text-gray-400',
          text: t('providerAdmin.limits.statusUnknown'),
        }
    }
  })()

  return (
    <div className={`flex min-h-6 flex-wrap items-center gap-2 text-xs ${tone}`}>
      {icon}
      <span className="font-medium">{text}</span>
      <span className="text-gray-500">· {describeLimit(state, t)}</span>
    </div>
  )
}
