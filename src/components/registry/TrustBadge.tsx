import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { TONE_CLASSES, type StatusTone } from '@/components/ui'
import type { TrustLevel } from '@/types'

// ── Trust level config ────────────────────────────────────────────────────

interface TrustConfig {
  label: string
  icon: typeof Shield
  tone: StatusTone
}

const trustConfigs: Record<TrustLevel, TrustConfig> = {
  high: { label: 'High trust', icon: ShieldCheck, tone: 'success' },
  medium: { label: 'Medium trust', icon: Shield, tone: 'warning' },
  low: { label: 'Low trust', icon: ShieldAlert, tone: 'warning' },
  untrusted: { label: 'Untrusted', icon: ShieldX, tone: 'danger' },
}

function configFor(level: TrustLevel): TrustConfig {
  return trustConfigs[level] ?? trustConfigs.untrusted
}

/** Plain-French one-liner explaining the trust score (catalog / import wizard). */
const TRUST_HINT =
  'Score de confiance calculé à partir de l’énergie, de la cohésion, des activations et du taux de réussite du skill dans son projet d’origine.'

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
  const config = configFor(trustLevel)
  const Icon = config.icon
  const pct = (trustScore * 100).toFixed(0)

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${TONE_CLASSES[config.tone].text} ${className}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {config.label} <span className="tabular-nums">{pct}%</span>
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
  const config = configFor(trustLevel)
  const Icon = config.icon
  const pct = trustScore * 100
  const tone = TONE_CLASSES[config.tone]

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <Icon className={`w-3.5 h-3.5 ${tone.text}`} aria-hidden="true" />
          {config.label}
        </span>
        <span className={`text-xs tabular-nums ${tone.text}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${tone.dot}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="mt-1 text-xs leading-4 text-gray-500">{TRUST_HINT}</p>
    </div>
  )
}
