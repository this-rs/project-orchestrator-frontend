import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { TONE_CLASSES, type StatusTone } from '@/components/ui'
import { useT, type MessageKey } from '@/i18n'
import type { TrustLevel } from '@/types'

// ── Trust level config ────────────────────────────────────────────────────

interface TrustConfig {
  /** Key of the label, read in the language on screen when the badge renders. */
  labelKey: MessageKey
  icon: typeof Shield
  tone: StatusTone
}

const trustConfigs: Record<TrustLevel, TrustConfig> = {
  high: { labelKey: 'siteRest.trust.high', icon: ShieldCheck, tone: 'success' },
  medium: { labelKey: 'siteRest.trust.medium', icon: Shield, tone: 'warning' },
  low: { labelKey: 'siteRest.trust.low', icon: ShieldAlert, tone: 'warning' },
  untrusted: { labelKey: 'siteRest.trust.untrusted', icon: ShieldX, tone: 'danger' },
}

function configFor(level: TrustLevel): TrustConfig {
  return trustConfigs[level] ?? trustConfigs.untrusted
}

// ── Compact inline value (meta lines) ─────────────────────────────────────

interface TrustBadgeProps {
  trustScore: number
  trustLevel: TrustLevel
  className?: string
}

/**
 * Inline trust value — shield icon + `High trust 82%` in the tone colour.
 * No filled pill, no glow (DESIGN §4); the level is spelled out, not
 * hidden in a tooltip.
 */
export function TrustBadge({ trustScore, trustLevel, className = '' }: TrustBadgeProps) {
  const { t } = useT()
  const config = configFor(trustLevel)
  const Icon = config.icon
  const pct = (trustScore * 100).toFixed(0)

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${TONE_CLASSES[config.tone].text} ${className}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {t(config.labelKey)} <span className="tabular-nums">{pct}%</span>
    </span>
  )
}

// ── Detailed trust bar (import wizard) ────────────────────────────────────

interface TrustScoreBarProps {
  trustScore: number
  trustLevel: TrustLevel
  className?: string
}

/** Trust label + percentage + thin static meter + explanation. */
export function TrustScoreBar({ trustScore, trustLevel, className = '' }: TrustScoreBarProps) {
  const { t } = useT()
  const config = configFor(trustLevel)
  const Icon = config.icon
  const pct = trustScore * 100
  const tone = TONE_CLASSES[config.tone]

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <Icon className={`w-3.5 h-3.5 ${tone.text}`} aria-hidden="true" />
          {t(config.labelKey)}
        </span>
        <span className={`text-xs tabular-nums ${tone.text}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${tone.dot}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="mt-1 text-xs leading-4 text-gray-500">{t('siteRest.trust.hint')}</p>
    </div>
  )
}
