/**
 * ChatTimelinePage — the whole conversation as a trace, and the chain of
 * events behind whatever you pick: the request that started it, what it
 * triggered, its input, its output.
 *
 * The trace covers every turn from the first message, the threads the
 * conversation was relayed through and its child sessions
 * (`useConversationTrace`), and follows a live turn.
 *
 * `?item=<id>` keeps the selection in the URL, so a link lands on the same item.
 */
import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useWorkspaceSlug } from '@/hooks'
import { TraceView, EventChain, buildConversationTimeline, chainOf, resolveTarget, type TimelineItem } from '@/components/timeline'
import { workspacePath } from '@/utils/paths'
import { useTimelineContext } from '@/hooks/useTimelineContext'
import { useTimelineLabels } from '@/hooks/useTimelineLabels'
import { useConversationTrace } from '@/hooks/useConversationTrace'
import { PageHeader } from '@/components/ui'
import { useT } from '@/i18n'

export default function ChatTimelinePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const [params, setParams] = useSearchParams()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const { t } = useT()
  const labels = useTimelineLabels()
  const fallbackTitle = t('session.timeline.fallbackTitle', { id: sessionId.slice(0, 8) })

  const trace = useConversationTrace(sessionId || null)
  const context = useTimelineContext(sessionId || null, trace.streaming)
  const timeline = useMemo(
    () => buildConversationTimeline({
      sessions: trace.sessions.map((s) => (s.relation === 'root' ? { ...s, title: context.title ?? s.title ?? fallbackTitle } : s)),
      rootId: sessionId,
      session: context.session,
      decisions: context.decisions,
      work: context.work,
    }),
    [trace.sessions, sessionId, context, fallbackTitle],
  )
  const selectedId = params.get('item')
  const selected = timeline.items.find((i) => i.id === selectedId) ?? null
  const chain = useMemo(() => (selected ? chainOf(timeline.items, selected.id) : null), [timeline.items, selected])

  const select = useCallback((item: TimelineItem | null) => setParams(item ? { item: item.id } : {}, { replace: true }), [setParams])
  // Back to where it happened: the conversation (the transcript is not on this page), the plan, the task.
  const open = useCallback((item: TimelineItem) => {
    const target = resolveTarget(item, { workspaceSlug: wsSlug, sessionId, blockInPage: () => false, fallback: 'conversation' })
    if (target.type === 'navigate') navigate(target.to)
  }, [navigate, sessionId, wsSlug])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('session.timeline.title')}
        parentLinks={[{ icon: MessageSquare, label: t('session.timeline.back'), name: context.title ?? fallbackTitle, href: workspacePath(wsSlug, `/chat/${sessionId}`) }]}
        meta={[
          t('session.timeline.events', { n: timeline.items.length }),
          timeline.runningCount > 0 ? t('session.timeline.running', { n: timeline.runningCount }) : null,
        ].filter((m): m is string => m !== null)}
      />

      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
        <TraceView
          lanes={timeline.lanes}
          selectedId={selected?.id ?? null}
          onSelect={select}
          onOpen={open}
          density="comfortable"
          labels={labels}
          maxRowsHeight={560}
          detail="side"
          loading={trace.loading}
          failed={trace.failed}
          onRetry={trace.retry}
        />
      </div>

      {selected && chain ? (
        <EventChain item={selected} upstream={chain.upstream} downstream={chain.downstream} onSelect={select} labels={labels} />
      ) : (
        <p className="text-sm text-gray-400">{t('session.timeline.pick')}</p>
      )}
    </div>
  )
}
