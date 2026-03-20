/**
 * InlineConversation — full-width conversation panel shown below a wave.
 *
 * Connects via WebSocket to stream agent messages in real-time.
 * Supports stop/interrupt, link to full conversation, and auto-scroll.
 */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Loader2, X, ExternalLink, Square } from 'lucide-react'
import { chatApi } from '@/services/chat'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { useConversationWs } from '@/hooks/runner'
import { MessageBubble } from './MessageBubble'
import { WsStatusIndicator } from './WsStatusIndicator'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineConversationProps {
  sessionId: string
  taskTitle: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineConversation({ sessionId, taskTitle, onClose }: InlineConversationProps) {
  const { messages, status } = useConversationWs(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wsSlug = useWorkspaceSlug()
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const handleStop = async () => {
    setStopping(true)
    try { await chatApi.interruptSession(sessionId) } catch { /* ignore */ }
    finally { setStopping(false) }
  }

  return (
    <div className="border border-indigo-500/20 rounded-lg bg-[#0d0d1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-500/10 bg-indigo-500/[0.03]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Eye className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <h4 className="text-sm font-medium text-gray-200 truncate">{taskTitle}</h4>
          <WsStatusIndicator status={status} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {status === 'connected' && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/[0.1] transition-colors cursor-pointer disabled:opacity-50"
              title="Stop session"
            >
              {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          )}
          <Link
            to={workspacePath(wsSlug, `/chat/${sessionId}`)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
            title="View full conversation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-gray-500">
              {status === 'connected' ? 'Waiting for messages...' : status === 'connecting' ? 'Connecting to agent...' : 'No messages yet'}
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>
    </div>
  )
}
