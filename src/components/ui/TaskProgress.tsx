import { ProgressLine } from './ProgressLine'
import type { TaskCounts } from '@/services/progress'

/**
 * The progress block of a list card: hairline bar + « 3/8 done · 1 blocked ».
 * Goes in `EntityRow`'s `context` slot. Renders nothing for an entity without
 * tasks — an empty bar carries no information.
 */
export function TaskProgress({ counts, className = '' }: { counts?: TaskCounts; className?: string }) {
  if (!counts || counts.total === 0) return null
  const { total, completed, in_progress, blocked, failed, percentage } = counts
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <ProgressLine value={percentage} label={`${Math.round(percentage)}% of tasks completed`} className="max-w-[10rem] shrink" />
      <span className="text-[11px] leading-4 text-gray-500 tabular-nums whitespace-nowrap">
        {completed}/{total} done
        {in_progress > 0 && <span className="text-gray-400"> · {in_progress} active</span>}
        {blocked > 0 && <span className="text-amber-400"> · {blocked} blocked</span>}
        {failed > 0 && <span className="text-red-400"> · {failed} failed</span>}
      </span>
    </div>
  )
}
