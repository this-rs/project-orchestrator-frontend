import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/types'
import { ChatMessageBubble } from './ChatMessageBubble'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
  isLoadingHistory?: boolean
  isReplaying?: boolean
  onRespondPermission: (toolCallId: string, allowed: boolean) => void
  onRespondInput: (requestId: string, response: string) => void
}

export function ChatMessages({ messages, isStreaming, isLoadingHistory, isReplaying, onRespondPermission, onRespondInput }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  // Track if user has scrolled away from bottom
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
  }

  // Auto-scroll to bottom when new content arrives (skip during replay to avoid flash)
  useEffect(() => {
    if (!isReplaying && shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isReplaying])

  // Scroll to bottom when replay completes
  useEffect(() => {
    if (!isReplaying && messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [isReplaying, messages.length])

  if (messages.length === 0) {
    if (isLoadingHistory || isReplaying) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading messages...</span>
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        <div className="text-center">
          <p className="mb-1">Start a conversation</p>
          <p className="text-xs">The assistant can create tasks, plans, and more.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {messages.map((msg, index) => (
        <ChatMessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
          onRespondPermission={onRespondPermission}
          onRespondInput={onRespondInput}
        />
      ))}
      {isStreaming && messages[messages.length - 1]?.role === 'user' && (
        <div className="mb-4 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
        </div>
      )}
    </div>
  )
}
