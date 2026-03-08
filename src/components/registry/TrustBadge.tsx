import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { Tooltip } from '@/components/ui'
import type { TrustLevel } from '@/types'

// ── Trust level config ────────────────────────────────────────────────────

interface TrustConfig {
  label: string
  icon: typeof Shield
  barColor: string
  textColor: string
  bgColor: string
  ringColor: string
  glowClass: string
}

const trustConfigs: Record<TrustLevel, TrustConfig> = {
  high: {
    label: 'High Trust',
    icon: ShieldCheck,
    barColor: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-900/50',
    ringColor: 'ring-emerald-500/20',
    glowClass: 'glow-success',
  },
  medium: {
    label: 'Medium Trust',
    icon: Shield,
    barColor: 'bg-amber-500',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-900/50',
    ringColor: 'ring-amber-500/20',
    glowClass: 'glow-warning',
  },
  low: {
    label: 'Low Trust',
    icon: ShieldAlert,
    barColor: 'bg-orange-500',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-900/50',
    ringColor: 'ring-orange-500/20',
    glowClass: '',
  },
  untrusted: {
    label: 'Untrusted',
    icon: ShieldX,
    barColor: 'bg-red-500',
    textColor: 'text-red-400',
    bgColor: 'bg-red-900/50',
    ringColor: 'ring-red-500/20',
    glowClass: 'glow-danger',
  },
}

// ── Compact badge (inline) ────────────────────────────────────────────────

interface TrustBadgeProps {
  trustScore: number
  trustLevel: TrustLevel
  className?: string
}

/**
 * Compact trust badge showing shield icon + score.
 * Used inline in skill cards and search results.
 */
export function TrustBadge({ trustScore, trustLevel, className = '' }: TrustBadgeProps) {
  const config = trustConfigs[trustLevel]
  const Icon = config.icon
  const pct = (trustScore * 100).toFixed(0)

  return (
    <Tooltip content={`${config.label} (${pct}%)`}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${config.bgColor} ${config.textColor} ${config.ringColor} ${config.glowClass} ${className}`}
      >
        <Icon className="w-3 h-3" />
        {pct}%
      </span>
    </Tooltip>
  )
}

// ── Detailed trust bar (for detail views / import wizard) ─────────────────

interface TrustScoreBarProps {
  trustScore: number
  trustLevel: TrustLevel
  className?: string
}

/**
 * Horizontal trust score bar with label and percentage.
 * Used in detail/import views for a more visual representation.
 */
export function TrustScoreBar({ trustScore, trustLevel, className = '' }: TrustScoreBarProps) {
  const config = trustConfigs[trustLevel]
  const Icon = config.icon
  const pct = trustScore * 100

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <Icon className={`w-3.5 h-3.5 ${config.textColor}`} />
          {config.label}
        </span>
        <span className={`text-xs font-medium ${config.textColor}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  )
}
