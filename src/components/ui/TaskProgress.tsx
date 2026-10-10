import { CircleAlert, CircleX } from 'lucide-react'
import { ProgressLine } from './ProgressLine'
import { TONE_CLASSES } from './statusMeta'
import type { TaskCounts } from '@/services/progress'
import { useT } from '@/i18n'

/**
 * The progress block of a list card: a segmented bar (done / active / blocked /
 * failed) + « 3/8 tasks done · 38% » and the non-zero exceptions spelled out.
 * Goes in `EntityRow`'s `context` slot. Renders nothing for an entity without
 * tasks — an empty bar carries no information.
 *
 * Health is readable three ways: segment colour, the count in words, and an
 * icon on blocked / failed — never colour alone.
 */
export function TaskProgress({ counts, className = '' }: { counts?: TaskCounts; className?: string }) {
  const { t } = useT()
  if (!counts || counts.total === 0) return null
  const { total, completed, in_progress, blocked, failed, percentage } = counts
  const share = (n: number) => (n / total) * 100
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 ${className}`}>
      <ProgressLine
        value={percentage}
        label={t('ui.taskProgress.completedLabel', { percent: Math.round(percentage) })}
        size="md"
        className="w-28 sm:w-40 shrink-0"
        segments={[
          { pct: share(completed), className: 'bg-emerald-500/80' },
          { pct: share(in_progress), className: 'bg-indigo-400' },
          { pct: share(blocked), className: 'bg-amber-400' },
          { pct: share(failed), className: 'bg-red-400' },
        ]}
      />
      <span className="text-xs leading-4 tabular-nums whitespace-nowrap text-gray-400">
        <span className="text-gray-200 font-medium">
          {completed}/{total}
        </span>{' '}
        {t('ui.taskProgress.done')} <span className="text-gray-500">({Math.round(percentage)}%)</span>
      </span>
      {in_progress > 0 && (
        <span className={`text-xs leading-4 tabular-nums whitespace-nowrap ${TONE_CLASSES.progress.text}`}>{t('ui.taskProgress.active', { count: in_progress })}</span>
      )}
      {blocked > 0 && (
        <span className={`inline-flex items-center gap-1 text-xs leading-4 tabular-nums whitespace-nowrap ${TONE_CLASSES.warning.text}`}>
          <CircleAlert className="w-3 h-3" aria-hidden="true" />
          {t('ui.taskProgress.blocked', { count: blocked })}
        </span>
      )}
      {failed > 0 && (
        <span className={`inline-flex items-center gap-1 text-xs leading-4 tabular-nums whitespace-nowrap ${TONE_CLASSES.danger.text}`}>
          <CircleX className="w-3 h-3" aria-hidden="true" />
          {t('ui.taskProgress.failed', { count: failed })}
        </span>
      )}
    </div>
  )
}
