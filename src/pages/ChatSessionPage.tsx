/**
 * ChatSessionPage — fullscreen read-only conversation viewer.
 *
 * Reached via /chat/:sessionId from runner "View full conversation" or
 * discussion panel "View Full" buttons.
 *
 * Connects to the session WebSocket and renders messages using the same
 * ChatMessageBubble component as the main chat.
 */

import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowDown } from 'lucide-react'
import { useConversationWs } from '@/hooks/runner'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { WsStatusIndicator } from '@/components/runner/WsStatusIndicator'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'

// No-op handlers for read-only mode
const noop = () => {}
const noopPermission = () => {}

export default function ChatSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const wsSlug = useWorkspaceSlug()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, status: wsStatus } = useConversationWs(sessionId ?? '')

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [messages.length])

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        No session ID provided
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-[calc(100vh-4rem)] -mx-4 md:-mx-6">
      {/* Header — full bleed via negative margins to counter MainLayout px-4/px-6 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10 bg-slate-900/80 backdrop-blur-sm shrink-0">
        <Link
          to={workspacePath(wsSlug, '/overview')}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
          title="Back"
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
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-1"
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
        onClick={scrollToBottom}
        className="absolute bottom-6 right-6 p-2 rounded-full bg-slate-800 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-700 shadow-lg transition-colors cursor-pointer"
        title="Scroll to bottom"
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  )
}
