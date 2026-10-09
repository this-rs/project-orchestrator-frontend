/**
 * The timeline strip above the transcript.
 *
 * Glue only: it turns the messages of the conversation on screen into lanes
 * (`buildTimeline`) and hands them to the reusable `<Timeline>`. Choosing an
 * item scrolls the transcript to its block; the link opens the dedicated page
 * with the whole chain of events.
 */
import { memo, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { focusRing } from '@/components/ui/classes'
import { useT } from '@/i18n'
import { useTimelineLabels } from '@/hooks/useTimelineLabels'
import type { ChatMessage } from '@/types'
import { Timeline, buildTimeline, resolveTarget, type TimelineItem, type TimelineRunInput } from '@/components/timeline'
import { workspacePath } from '@/utils/paths'
import { useTimelineContext } from '@/hooks/useTimelineContext'

/** The strip draws the end of a lane; the page shows all of it. */
const STRIP_MAX_ITEMS = 300

interface ChatTimelineStripProps {
  sessionId: string | null
  messages: ReadonlyArray<ChatMessage>
  isStreaming: boolean
  title?: string | null
  runs?: ReadonlyArray<TimelineRunInput>
  workspaceSlug?: string | null
}

export const ChatTimelineStrip = memo(function ChatTimelineStrip({ sessionId, messages, isStreaming, title, runs, workspaceSlug }: ChatTimelineStripProps) {
  // Re-read the routing decisions and the work graph when a turn ends, not on every token.
  const { t } = useT()
  const labels = useTimelineLabels()
  const context = useTimelineContext(sessionId, isStreaming)
  const timeline = useMemo(
    () => buildTimeline({ messages, sessionId: sessionId ?? 'new', title: title ?? context.title, isStreaming, runs, session: context.session, decisions: context.decisions, work: context.work }),
    [messages, sessionId, title, isStreaming, runs, context],
  )

  const navigate = useNavigate()
  const handleSelect = useCallback((item: TimelineItem) => {
    if (!sessionId || !workspaceSlug) return
    const findBlock = (anchorId: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tool-call-id]')).find((el) => el.dataset.toolCallId === anchorId)
    const target = resolveTarget(item, { workspaceSlug, sessionId, blockInPage: (a) => !!findBlock(a) })
    if (target.type === 'scroll') findBlock(target.anchorId)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    else navigate(target.to)
  }, [navigate, sessionId, workspaceSlug])

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-white/10 bg-slate-900/60 px-3 py-1" data-testid="chat-timeline-strip">
      <div className="min-w-0 flex-1">
        <Timeline lanes={timeline.lanes} onSelect={handleSelect} maxItems={STRIP_MAX_ITEMS} labels={labels} />
      </div>
      {sessionId && workspaceSlug && (
        <Link
          to={workspacePath(workspaceSlug, `/chat/${sessionId}/timeline`)}
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200 md:size-8 ${focusRing}`}
          title={t('session.timeline.openPage')}
          aria-label={t('session.timeline.openPage')}
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
})
