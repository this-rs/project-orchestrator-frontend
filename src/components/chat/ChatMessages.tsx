import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/types'
import { ChatMessageBubble } from './ChatMessageBubble'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onRespondPermission: (toolCallId: string, allowed: boolean) => void
  onRespondInput: (requestId: string, response: string) => void
}

export function ChatMessages({ messages, isStreaming, onRespondPermission, onRespondInput }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  // Track if user has scrolled away from bottom
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100
  }

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) {
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
