import { useMemo } from 'react'
import { useT } from '@/i18n'
import type { TimelineLabels } from '@/components/timeline'

/** The words of the timeline in the reader's language (the component itself only knows English defaults). */
export function useTimelineLabels(): TimelineLabels {
  const { t } = useT()
  return useMemo(
    () => ({
      status: {
        running: t('session.timeline.status.running'),
        done: t('session.timeline.status.done'),
        error: t('session.timeline.status.error'),
        blocked: t('session.timeline.status.blocked'),
        cancelled: t('session.timeline.status.cancelled'),
        pending: t('session.timeline.status.pending'),
        unknown: t('session.timeline.status.unknown'),
      },
      empty: t('session.timeline.empty'),
      earlier: t('session.timeline.earlier', { n: '{n}' }),
      list: t('session.timeline.title'),
    }),
    [t],
  )
}
