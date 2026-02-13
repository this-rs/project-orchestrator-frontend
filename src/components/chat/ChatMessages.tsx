import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useAtom } from 'jotai'
import { chatScrollToTurnAtom } from '@/atoms'
import type { ChatMessage } from '@/types'
import { ChatMessageBubble } from './ChatMessageBubble'

/** Pixel threshold from top to trigger loading older messages */
const SCROLL_TOP_THRESHOLD = 80

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
  isLoadingHistory?: boolean
  isReplaying?: boolean
  hasOlderMessages?: boolean
  isLoadingOlder?: boolean
  onLoadOlder?: () => void
  onRespondPermission: (toolCallId: string, allowed: boolean) => void
  onRespondInput: (requestId: string, response: string) => void
}

export function ChatMessages({
  messages,
  isStreaming,
  isLoadingHistory,
  isReplaying,
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder,
  onRespondPermission,
  onRespondInput,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const [scrollToTurn, setScrollToTurn] = useAtom(chatScrollToTurnAtom)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  // Track previous scrollHeight to preserve scroll position after prepending older messages
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingOlderRef = useRef(false)

  // Track the last message ID to detect prepend vs append.
  // If messages grow and the FIRST message ID changed → prepend (older messages loaded).
  // If messages grow and the LAST message ID changed → append (new message from stream/user).
  const firstMessageIdRef = useRef<string | null>(null)
  const prevMessageCountRef = useRef(0)

  // Keep ref in sync with prop for use in scroll handler
  useEffect(() => {
    isLoadingOlderRef.current = !!isLoadingOlder
  }, [isLoadingOlder])

  // Track if user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100

    // Reverse infinite scroll: trigger load when near top
    if (
      scrollTop < SCROLL_TOP_THRESHOLD &&
      hasOlderMessages &&
      !isLoadingOlderRef.current &&
      onLoadOlder
    ) {
      // Capture scrollHeight BEFORE loading so we can restore position after
      prevScrollHeightRef.current = scrollHeight
      // Disable auto-scroll — user is at the top, we must preserve their position
      shouldAutoScrollRef.current = false
      onLoadOlder()
    }
  }, [hasOlderMessages, onLoadOlder])

  // Detect whether messages were prepended (older loaded) or appended (new messages)
  // and restore scroll position after prepend.
  // useLayoutEffect runs synchronously before browser paint — prevents visible flash/jump.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || messages.length === 0) {
      firstMessageIdRef.current = messages[0]?.id ?? null
      prevMessageCountRef.current = messages.length
      return
    }

    const currentFirstId = messages[0].id
    const wasPrepend =
      messages.length > prevMessageCountRef.current &&
      firstMessageIdRef.current !== null &&
      currentFirstId !== firstMessageIdRef.current

    if (wasPrepend && prevScrollHeightRef.current > 0) {
      // Older messages were prepended — restore scroll position
      const newScrollHeight = el.scrollHeight
      const heightDiff = newScrollHeight - prevScrollHeightRef.current
      if (heightDiff > 0) {
        el.scrollTop += heightDiff
      }
      prevScrollHeightRef.current = 0
      // Keep auto-scroll disabled — user was scrolling up
      shouldAutoScrollRef.current = false
    }

    firstMessageIdRef.current = currentFirstId
    prevMessageCountRef.current = messages.length
  }, [messages])

  // Auto-scroll to bottom when new content arrives (only when user is near bottom)
  useEffect(() => {
    if (!isReplaying && shouldAutoScrollRef.current && scrollRef.current) {
      // Don't auto-scroll to bottom if we have a scroll target pending
      if (scrollToTurn !== null) return
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isReplaying, scrollToTurn])

  // Scroll to target message when replay completes
  useEffect(() => {
    if (isReplaying || scrollToTurn === null || messages.length === 0) return

    // turn_index maps to user messages: the user message for turn N is at position N*2
    // We target the user message of that turn
    const targetIndex = scrollToTurn * 2
    if (targetIndex >= messages.length) {
      // Target not found, clear and bail
      setScrollToTurn(null)
      return
    }

    // Find the DOM element by data attribute
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-msg-index="${targetIndex}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedIndex(targetIndex)
        // Clear highlight after animation
        setTimeout(() => setHighlightedIndex(null), 2500)
      }
      setScrollToTurn(null)
    })
  }, [isReplaying, scrollToTurn, messages.length, setScrollToTurn])

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
      {/* Loading older messages spinner */}
      {isLoadingOlder && (
        <div className="flex items-center justify-center py-3">
          <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="ml-2 text-xs text-gray-500">Loading older messages...</span>
        </div>
      )}

      {/* "Beginning of conversation" marker when no more older messages */}
      {!hasOlderMessages && messages.length > 0 && !isLoadingOlder && (
        <div className="text-center text-[10px] text-gray-600 py-2 mb-2">
          — Beginning of conversation —
        </div>
      )}

      {messages.map((msg, index) => (
        <div key={msg.id} data-msg-index={index}>
          <ChatMessageBubble
            message={msg}
            isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
            highlighted={highlightedIndex === index}
            onRespondPermission={onRespondPermission}
            onRespondInput={onRespondInput}
          />
        </div>
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
