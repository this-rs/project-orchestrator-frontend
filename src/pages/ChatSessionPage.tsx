/**
 * ChatSessionPage — fullscreen read-only conversation viewer.
 *
 * Reached via /chat/:sessionId from runner "View full conversation" or
 * discussion panel "View Full" buttons.
 *
 * Connects to the session WebSocket and renders messages using the same
 * ChatMessageBubble component as the main chat.
 */

import { useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowDown } from 'lucide-react'
import { useConversationWs } from '@/hooks/runner'
import { useDetachedRuns, useWorkspaceSlug } from '@/hooks'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { AgenticModePill } from '@/components/chat/AgenticModePill'
import { AgenticModeBanner } from '@/components/chat/AgenticModeBanner'
import { WsStatusIndicator } from '@/components/runner/WsStatusIndicator'
import { chatApi } from '@/services/chat'
import { workspacePath } from '@/utils/paths'

// No-op handlers for read-only mode
const noop = () => {}
const noopPermission = () => {}

export default function ChatSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const { messages, status: wsStatus } = useConversationWs(sessionId ?? '')
  // Follows the live conversation, but never pulls back a reader who scrolled up.
  const { scrollRef, scrollToBottom } = useStickToBottom<HTMLDivElement>(messages)
  // Agentic mode surfaces: detached runs spawned by this session.
  const detachedRuns = useDetachedRuns(sessionId ?? null)

  const handleViewRun = useCallback((childSessionId: string) => {
    navigate(workspacePath(wsSlug, `/chat/${childSessionId}`))
  }, [navigate, wsSlug])
  const handleStopRun = useCallback((childSessionId: string) => {
    // Best-effort interrupt — the UI updates via WebSocket events. Still
    // report failures: a silent catch here is what kept a dead endpoint
    // invisible.
    chatApi.interruptSession(childSessionId)
      .then((outcome) => {
        if (!outcome?.delivered) {
          console.warn('Stop run: nothing was interrupted', childSessionId, outcome)
        }
      })
      .catch((err) => console.error('Stop run failed', childSessionId, err))
  }, [])

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        No session ID provided
      </div>
    )
  }

  return (
    // h-full, not a viewport calc: MainLayout hands this route its whole
    // content area (see `ownsContentArea`). A `calc(100dvh - header)` height
    // filled the area exactly while the layout still added its footer below,
    // so the page scrolled a second time, behind the conversation.
    <div className="relative flex flex-col h-full min-h-0 -mx-4 md:-mx-6">
      {/* Header — full bleed via negative margins to counter MainLayout px-4/px-6 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10 bg-slate-900/80 backdrop-blur-sm shrink-0">
        <Link
          to={workspacePath(wsSlug, '/overview')}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium text-slate-200 truncate">
            Session {sessionId.slice(0, 8)}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <WsStatusIndicator status={wsStatus} />
            <span className="text-[11px] text-slate-500">
              {messages.length} messages
            </span>
          </div>
        </div>
        {/* Agentic mode pill — surfaces background-run state for this session */}
        <AgenticModePill
          runs={detachedRuns.runs}
          hasActiveRuns={detachedRuns.hasActiveRuns}
        />
      </div>

      {/* Agentic mode banner — rich live grid of streaming sub-agents */}
      <AgenticModeBanner
        runs={detachedRuns.runs}
        onViewRun={handleViewRun}
        onStopRun={handleStopRun}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-1"
      >
        {messages.length === 0 && wsStatus === 'connected' && (
          <div className="text-center text-slate-600 text-sm py-12">
            No messages yet
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            isStreaming={false}
            onRespondPermission={noopPermission}
            onRespondInput={noop}
          />
        ))}
      </div>

      {/* Scroll to bottom FAB */}
      <button
        onClick={() => scrollToBottom()}
        className="absolute bottom-6 right-6 p-2 rounded-full bg-slate-800 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-700 shadow-lg transition-colors cursor-pointer"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  )
}
