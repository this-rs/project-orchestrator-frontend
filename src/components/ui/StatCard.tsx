import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { AnimatedCounter } from './AnimatedCounter'
import { Sparkline } from './Sparkline'

interface StatCardTrend {
  value: number
  direction: 'up' | 'down'
}

interface StatCardProps {
  /** Icon displayed top-left */
  icon?: ReactNode
  /** Label under the value */
  label: string
  /** Numeric value (animated from 0 on mount) */
  value: number
  /** Optional suffix (e.g. "%") */
  suffix?: string
  /** Optional prefix (e.g. "$") */
  prefix?: string
  /** Trend indicator (arrow + percentage) */
  trend?: StatCardTrend
  /** Optional sparkline data points for mini trend chart */
  sparklineData?: number[]
  /** Sparkline color (defaults to accent-derived or indigo) */
  sparklineColor?: string
  /** Top border accent color class (e.g. "border-indigo-500") */
  accent?: string
  /** Animation stagger delay in ms */
  delay?: number
}

/**
 * Stat card with animated counter, optional icon, sparkline, and trend indicator.
 * Uses glassmorphism styling with a colored top border accent.
 *
 * @example
 * <StatCard icon={<ClipboardList />} label="Plans" value={12} accent="border-indigo-500" />
 * <StatCard icon={<CheckCircle2 />} label="Completed" value={87} suffix="%" trend={{ value: 5, direction: 'up' }} />
 * <StatCard label="Tasks" value={42} sparklineData={[3,7,4,8,2,6,9]} sparklineColor="#818cf8" />
 */
export function StatCard({
  icon,
  label,
  value,
  suffix,
  prefix,
  trend,
  sparklineData,
  sparklineColor = '#818cf8',
  accent = 'border-indigo-500',
  delay = 0,
}: StatCardProps) {
  return (
    <div className={`glass rounded-xl shadow-sm overflow-hidden border-t-2 ${accent}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {icon && (
              <div className="text-gray-500 mb-2">{icon}</div>
            )}
            <div className="text-2xl font-bold text-gray-100" style={{ fontSize: 'var(--fluid-2xl)' }}>
              <AnimatedCounter value={value} prefix={prefix} suffix={suffix} duration={800 + delay} />
            </div>
            <div className="text-sm text-gray-400 mt-0.5">{label}</div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {trend && (
              <div
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                  trend.direction === 'up'
                    ? 'text-green-400 bg-green-500/10'
                    : 'text-red-400 bg-red-500/10'
                }`}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {trend.value}%
              </div>
            )}
            {sparklineData && sparklineData.length >= 2 && (
              <Sparkline
                data={sparklineData}
                color={sparklineColor}
                width={64}
                height={24}
                fill
                animationDuration={1000 + delay}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
