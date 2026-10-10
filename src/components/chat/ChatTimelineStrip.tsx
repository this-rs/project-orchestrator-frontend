/**
 * The trace strip above the transcript.
 *
 * Glue only: it loads the WHOLE conversation (every page of the history, its
 * relayed threads and its child sessions — `useConversationTrace`), turns it
 * into lanes (`buildConversationTimeline`) and hands them to the reusable
 * `<TraceView>`. Until the history arrives it shows what the transcript holds.
 * "Show in the conversation" scrolls the transcript to the block; the link
 * opens the dedicated page.
 */
import { memo, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { focusRing } from '@/components/ui/classes'
import { useT } from '@/i18n'
import { useTimelineLabels } from '@/hooks/useTimelineLabels'
import { useConversationTrace } from '@/hooks/useConversationTrace'
import type { ChatMessage } from '@/types'
import { TraceView, buildConversationTimeline, buildTimeline, resolveTarget, type TimelineItem, type TimelineRunInput } from '@/components/timeline'
import { workspacePath } from '@/utils/paths'
import { useTimelineContext } from '@/hooks/useTimelineContext'

interface ChatTimelineStripProps {
  sessionId: string | null
  messages: ReadonlyArray<ChatMessage>
  isStreaming: boolean
  title?: string | null
  /** Detached runs known to the chat: shown until the session tree is loaded. */
  runs?: ReadonlyArray<TimelineRunInput>
  workspaceSlug?: string | null
}

export const ChatTimelineStrip = memo(function ChatTimelineStrip({ sessionId, messages, isStreaming, title, runs, workspaceSlug }: ChatTimelineStripProps) {
  const { t } = useT()
  const labels = useTimelineLabels()
  // Re-read the routing decisions and the work graph when a turn ends, not on every token.
  const context = useTimelineContext(sessionId, isStreaming)
  const trace = useConversationTrace(sessionId, { isStreaming, refreshKey: messages, rootTitle: title ?? context.title })
  const timeline = useMemo(() => {
    const sid = sessionId ?? 'new'
    const shared = { session: context.session, decisions: context.decisions, work: context.work }
    if (trace.sessions.length > 0) return buildConversationTimeline({ sessions: trace.sessions, rootId: sid, ...shared })
    // Before the history arrives (or for a conversation not saved yet): what the transcript holds.
    return buildTimeline({ messages, sessionId: sid, title: title ?? context.title, isStreaming, runs, ...shared })
  }, [trace.sessions, messages, sessionId, title, isStreaming, runs, context])

  const navigate = useNavigate()
  const handleOpen = useCallback((item: TimelineItem) => {
    if (!sessionId || !workspaceSlug) return
    const findBlock = (anchorId: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tool-call-id]')).find((el) => el.dataset.toolCallId === anchorId)
    const target = resolveTarget(item, { workspaceSlug, sessionId, blockInPage: (a) => !!findBlock(a) })
    if (target.type === 'scroll') findBlock(target.anchorId)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    else navigate(target.to)
  }, [navigate, sessionId, workspaceSlug])

  return (
    <div className="flex max-h-[min(60dvh,36rem)] shrink-0 items-start gap-2 overflow-y-auto border-b border-white/10 bg-slate-900/60 px-3 py-1" data-testid="chat-timeline-strip">
      <div className="min-w-0 flex-1">
        <TraceView
          lanes={timeline.lanes}
          onOpen={handleOpen}
          labels={labels}
          maxRowsHeight={224}
          detail="below"
          loading={sessionId ? trace.loading : null}
          failed={trace.failed}
          onRetry={trace.retry}
        />
      </div>
      {sessionId && workspaceSlug && (
        <Link
          to={workspacePath(workspaceSlug, `/chat/${sessionId}/timeline`)}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200 md:size-8 ${focusRing}`}
          title={t('session.timeline.openPage')}
          aria-label={t('session.timeline.openPage')}
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
})
