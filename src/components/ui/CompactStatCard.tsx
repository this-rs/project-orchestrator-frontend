import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface CompactStatCardTrend {
  value: number
  direction: 'up' | 'down'
}

type AccentColor = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'gray'

const accentStyles: Record<AccentColor, { icon: string; border: string }> = {
  indigo: { icon: 'text-indigo-400', border: 'border-indigo-500/30' },
  emerald: { icon: 'text-emerald-400', border: 'border-emerald-500/30' },
  amber: { icon: 'text-amber-400', border: 'border-amber-500/30' },
  rose: { icon: 'text-rose-400', border: 'border-rose-500/30' },
  sky: { icon: 'text-sky-400', border: 'border-sky-500/30' },
  violet: { icon: 'text-violet-400', border: 'border-violet-500/30' },
  gray: { icon: 'text-gray-400', border: 'border-gray-500/30' },
}

interface CompactStatCardProps {
  /** Stat label */
  label: string
  /** Display value (string to allow formatted values like "87%") */
  value: string | number
  /** Icon displayed inline */
  icon?: ReactNode
  /** Optional trend indicator */
  trend?: CompactStatCardTrend
  /** Accent color theme */
  color?: AccentColor
  /** Optional click handler */
  onClick?: () => void
}

/**
 * Lightweight stat card for inline metrics display.
 * Compact alternative to StatCard, suitable for dashboards with many metrics.
 *
 * @example
 * <CompactStatCard label="Tasks" value={42} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
 * <CompactStatCard label="Completion" value="87%" trend={{ value: 5, direction: 'up' }} color="indigo" />
 */
export function CompactStatCard({
  label,
  value,
  icon,
  trend,
  color = 'indigo',
  onClick,
}: CompactStatCardProps) {
  const styles = accentStyles[color]
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg
        bg-white/[0.04] border ${styles.border}
        ${onClick ? 'cursor-pointer hover:bg-white/[0.07] transition-colors' : ''}
      `}
    >
      {icon && <span className={`shrink-0 ${styles.icon}`}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-gray-500 leading-none mb-0.5 truncate">{label}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-100">{value}</span>
          {trend && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                trend.direction === 'up' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {trend.value}%
            </span>
          )}
        </div>
      </div>
    </Component>
  )
}
