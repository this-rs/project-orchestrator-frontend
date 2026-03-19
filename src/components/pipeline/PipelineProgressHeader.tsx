import { TrendingUp, TrendingDown, Minus, HelpCircle, Activity } from 'lucide-react'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { ProgressScoreResponse, ProgressTrend } from '@/types/chat'

interface PipelineProgressHeaderProps {
  progress: ProgressScoreResponse | null
  className?: string
}

const trendConfig: Record<ProgressTrend, { icon: typeof TrendingUp; label: string; color: string }> = {
  Improving: { icon: TrendingUp, label: 'Improving', color: 'text-green-400' },
  Stable: { icon: Minus, label: 'Stable', color: 'text-gray-400' },
  Regressing: { icon: TrendingDown, label: 'Regressing', color: 'text-red-400' },
  Stagnant: { icon: Activity, label: 'Stagnant', color: 'text-yellow-400' },
  Unknown: { icon: HelpCircle, label: 'Unknown', color: 'text-gray-500' },
}

/**
 * Progress header showing score bar, trend indicator, and dimension breakdown.
 */
export function PipelineProgressHeader({ progress, className = '' }: PipelineProgressHeaderProps) {
  if (!progress) {
    return (
      <div className={`p-4 bg-white/[0.04] rounded-lg ${className}`}>
        <p className="text-sm text-gray-500">No progress data yet</p>
      </div>
    )
  }

  const pct = Math.round(progress.score * 100)
  const trend = trendConfig[progress.trend] ?? trendConfig.Unknown
  const TrendIcon = trend.icon

  const dimensions = [
    { label: 'Build', value: progress.dimensions.build, color: 'bg-blue-500' },
    { label: 'Tests', value: progress.dimensions.tests, color: 'bg-green-500' },
    { label: 'Coverage', value: progress.dimensions.coverage, color: 'bg-yellow-500' },
    { label: 'Steps', value: progress.dimensions.steps, color: 'bg-purple-500' },
  ]

  return (
    <div className={`p-4 bg-white/[0.04] rounded-lg space-y-3 ${className}`}>
      {/* Score + Trend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-100">{pct}%</span>
          <div className={`flex items-center gap-1 ${trend.color}`}>
            <TrendIcon className="w-4 h-4" />
            <span className="text-xs font-medium">{trend.label}</span>
          </div>
        </div>
        {progress.delta !== null && (
          <span className={`text-xs ${progress.delta > 0 ? 'text-green-400' : progress.delta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {progress.delta > 0 ? '+' : ''}{(progress.delta * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar value={pct} gradient shimmer={pct < 100} size="md" />

      {/* Dimensions breakdown */}
      <div className="grid grid-cols-4 gap-2">
        {dimensions.map((dim) => (
          <div key={dim.label} className="text-center">
            <div className="text-xs text-gray-500 mb-1">{dim.label}</div>
            <div className="w-full bg-white/[0.08] rounded-full h-1.5">
              <div
                className={`h-full rounded-full ${dim.color}`}
                style={{ width: `${Math.round(dim.value * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {Math.round(dim.value * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
