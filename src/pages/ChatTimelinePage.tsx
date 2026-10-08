/**
 * ChatTimelinePage — the whole timeline of one conversation, and the chain of
 * events behind whatever you pick: the request that started it, what it
 * triggered, its input, its output.
 *
 * `?item=<id>` keeps the selection in the URL, so a link lands on the same item.
 */
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useConversationWs } from '@/hooks/runner'
import { useDetachedRuns, useWorkspaceSlug } from '@/hooks'
import { Timeline, EventChain, buildTimeline, chainOf, type TimelineItem } from '@/components/timeline'
import { workspacePath } from '@/utils/paths'
import { useTimelineContext } from '@/hooks/useTimelineContext'

export default function ChatTimelinePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const [params, setParams] = useSearchParams()
  const wsSlug = useWorkspaceSlug()
  const { messages } = useConversationWs(sessionId)
  const detached = useDetachedRuns(sessionId || null)
  const streaming = messages.some((m) => m.isStreaming)

  const context = useTimelineContext(sessionId || null, streaming)
  const timeline = useMemo(
    () => buildTimeline({
      messages,
      sessionId,
      isStreaming: streaming,
      title: context.title ?? `Session ${sessionId.slice(0, 8)}`,
      runs: detached.runs,
      session: context.session,
      decisions: context.decisions,
      work: context.work,
    }),
    [messages, sessionId, streaming, detached.runs, context],
  )
  const selectedId = params.get('item')
  const selected = timeline.items.find((i) => i.id === selectedId) ?? null
  const chain = useMemo(() => (selected ? chainOf(timeline.items, selected.id) : null), [timeline.items, selected])

  const select = (item: TimelineItem) => setParams({ item: item.id }, { replace: true })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          to={workspacePath(wsSlug, `/chat/${sessionId}`)}
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
          aria-label="Back to the conversation"
          title="Back to the conversation"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-base font-medium text-slate-200">Timeline</h1>
        <span className="text-xs text-slate-500">
          {timeline.items.length} events{timeline.runningCount > 0 ? ` · ${timeline.runningCount} running` : ''}
        </span>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
        <Timeline lanes={timeline.lanes} selectedId={selected?.id} onSelect={select} density="comfortable" />
      </div>

      {selected && chain ? (
        <EventChain item={selected} upstream={chain.upstream} downstream={chain.downstream} onSelect={select} />
      ) : (
        <p className="text-sm text-slate-500">Pick an event to see the request behind it and what it triggered.</p>
      )}
    </div>
  )
}
