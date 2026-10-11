/**
 * The two ways to draw a conversation's timeline: tracks (one row per parallel
 * action, time across — the default) or the span tree. The choice is the reader's
 * and stays in this browser (`useTimelineView`).
 */
import { AudioLines, ListTree } from 'lucide-react'
import { ViewTabs } from '@/components/ui'
import { useT } from '@/i18n'
import type { TimelineView } from '@/hooks/useTimelineView'

export function TimelineViewTabs({ value, onChange, className }: { value: TimelineView; onChange: (view: TimelineView) => void; className?: string }) {
  const { t } = useT()
  return (
    <ViewTabs<TimelineView>
      tabs={[
        { id: 'tracks', label: t('session.timeline.view.tracks'), icon: <AudioLines /> },
        { id: 'tree', label: t('session.timeline.view.tree'), icon: <ListTree /> },
      ]}
      value={value}
      onChange={onChange}
      label={t('session.timeline.view.label')}
      className={className}
    />
  )
}
