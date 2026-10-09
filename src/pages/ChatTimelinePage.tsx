/**
 * ChatTimelinePage — the whole timeline of one conversation, and the chain of
 * events behind whatever you pick: the request that started it, what it
 * triggered, its input, its output.
 *
 * `?item=<id>` keeps the selection in the URL, so a link lands on the same item.
 */
import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useConversationWs } from '@/hooks/runner'
import { useDetachedRuns, useWorkspaceSlug } from '@/hooks'
import { Timeline, EventChain, buildTimeline, chainOf, type TimelineItem } from '@/components/timeline'
import { workspacePath } from '@/utils/paths'
import { useTimelineContext } from '@/hooks/useTimelineContext'
import { useTimelineLabels } from '@/hooks/useTimelineLabels'
import { PageHeader } from '@/components/ui'
import { useT } from '@/i18n'

export default function ChatTimelinePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const [params, setParams] = useSearchParams()
  const wsSlug = useWorkspaceSlug()
  const { t } = useT()
  const labels = useTimelineLabels()
  const { messages } = useConversationWs(sessionId)
  const detached = useDetachedRuns(sessionId || null)
  const streaming = messages.some((m) => m.isStreaming)

  const context = useTimelineContext(sessionId || null, streaming)
  const timeline = useMemo(
    () => buildTimeline({
      messages,
      sessionId,
      isStreaming: streaming,
      title: context.title ?? t('session.timeline.fallbackTitle', { id: sessionId.slice(0, 8) }),
      runs: detached.runs,
      session: context.session,
      decisions: context.decisions,
      work: context.work,
    }),
    [messages, sessionId, streaming, detached.runs, context, t],
  )
  const selectedId = params.get('item')
  const selected = timeline.items.find((i) => i.id === selectedId) ?? null
  const chain = useMemo(() => (selected ? chainOf(timeline.items, selected.id) : null), [timeline.items, selected])

  const select = (item: TimelineItem) => setParams({ item: item.id }, { replace: true })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('session.timeline.title')}
        parentLinks={[{ icon: MessageSquare, label: t('session.timeline.back'), name: context.title ?? t('session.timeline.fallbackTitle', { id: sessionId.slice(0, 8) }), href: workspacePath(wsSlug, `/chat/${sessionId}`) }]}
        meta={[
          t('session.timeline.events', { n: timeline.items.length }),
          timeline.runningCount > 0 ? t('session.timeline.running', { n: timeline.runningCount }) : null,
        ].filter((m): m is string => m !== null)}
      />

      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
        <Timeline lanes={timeline.lanes} selectedId={selected?.id} onSelect={select} density="comfortable" labels={labels} />
      </div>

      {selected && chain ? (
        <EventChain item={selected} upstream={chain.upstream} downstream={chain.downstream} onSelect={select} labels={labels} />
      ) : (
        <p className="text-sm text-gray-400">{t('session.timeline.pick')}</p>
      )}
    </div>
  )
}
