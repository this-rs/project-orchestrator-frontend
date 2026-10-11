/**
 * The conversation's trace, as the chat shows it (inside `<ChatTimelinePanel>`:
 * a side panel on desktop, a full-screen view on a phone).
 *
 * Glue only: it loads the WHOLE conversation (every page of the history, its
 * relayed threads and its child sessions — `useConversationTrace`), turns it
 * into lanes (`buildConversationTimeline`) and hands them to the reusable
 * `<TraceView>`. Until the history arrives it shows what the transcript holds, and the
 * history then takes over in place (same span keys, no blank in between).
 * "Show in the conversation" scrolls the transcript to the block.
 */
import { memo, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTimelineLabels } from '@/hooks/useTimelineLabels'
import { useConversationTrace } from '@/hooks/useConversationTrace'
import type { ChatMessage } from '@/types'
import { TraceView, adoptTranscriptIds, buildConversationTimeline, buildTimeline, resolveTarget, type TimelineItem, type TimelineRunInput } from '@/components/timeline'
import { useTimelineContext } from '@/hooks/useTimelineContext'

interface ChatTimelineStripProps {
  sessionId: string | null
  messages: ReadonlyArray<ChatMessage>
  isStreaming: boolean
  title?: string | null
  /** Detached runs known to the chat: shown until the session tree is loaded. */
  runs?: ReadonlyArray<TimelineRunInput>
  workspaceSlug?: string | null
  /** Height of the rows area, in px (the panel gives what it has). */
  maxRowsHeight?: number
  /** Called after "Show in the conversation" scrolled to the block (the full-screen view closes so it can be seen). */
  onShown?: () => void
}

export const ChatTimelineStrip = memo(function ChatTimelineStrip({ sessionId, messages, isStreaming, title, runs, workspaceSlug, maxRowsHeight = 224, onShown }: ChatTimelineStripProps) {
  const labels = useTimelineLabels()
  // Re-read the routing decisions and the work graph when a turn ends, not on every token.
  const context = useTimelineContext(sessionId, isStreaming)
  const trace = useConversationTrace(sessionId, { isStreaming, refreshKey: messages, rootTitle: title ?? context.title })
  const timeline = useMemo(() => {
    const sid = sessionId ?? 'new'
    const shared = { session: context.session, decisions: context.decisions, work: context.work }
    // The history replaces the transcript only once the session on screen has a page of it: never
    // a blank between the two, and the rows the reader already sees keep their place (same keys).
    if (trace.sessions.some((s) => s.relation === 'root')) {
      // Turns sent from this tab keep the client id the transcript gave them (their key).
      const sessions = trace.sessions.map((s) => (s.relation === 'root' ? { ...s, messages: adoptTranscriptIds(s.messages, messages) } : s))
      return buildConversationTimeline({ sessions, rootId: sid, ...shared })
    }
    // Before the history arrives (or for a conversation not saved yet): what the transcript holds.
    return buildTimeline({ messages, sessionId: sid, title: title ?? context.title, isStreaming, runs, ...shared })
  }, [trace.sessions, messages, sessionId, title, isStreaming, runs, context])

  const navigate = useNavigate()
  const handleOpen = useCallback((item: TimelineItem) => {
    if (!sessionId || !workspaceSlug) return
    const findBlock = (anchorId: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tool-call-id]')).find((el) => el.dataset.toolCallId === anchorId)
    const target = resolveTarget(item, { workspaceSlug, sessionId, blockInPage: (a) => !!findBlock(a) })
    if (target.type === 'scroll') {
      findBlock(target.anchorId)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      onShown?.()
    } else navigate(target.to)
  }, [navigate, sessionId, workspaceSlug, onShown])

  return (
    <div className="min-w-0" data-testid="chat-timeline-strip">
      <TraceView
        lanes={timeline.lanes}
        onOpen={handleOpen}
        labels={labels}
        maxRowsHeight={maxRowsHeight}
        detail="below"
        loading={sessionId ? trace.loading : null}
        failed={trace.failed}
        onRetry={trace.retry}
      />
    </div>
  )
})
