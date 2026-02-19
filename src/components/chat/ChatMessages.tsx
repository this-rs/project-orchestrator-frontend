import { memo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useAtom } from 'jotai'
import { chatScrollToTurnAtom } from '@/atoms'
import type { ChatMessage, Project } from '@/types'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatWelcome } from './ChatWelcome'
import { Loader2 } from 'lucide-react'

/** Pixel threshold from top to trigger loading older messages */
const SCROLL_TOP_THRESHOLD = 80
/** Pixel threshold from bottom to trigger loading newer messages */
const SCROLL_BOTTOM_THRESHOLD = 200

interface ChatMessagesProps {
  messages: ChatMessage[]
  isStreaming: boolean
  isLoadingHistory?: boolean
  isReplaying?: boolean
  hasOlderMessages?: boolean
  isLoadingOlder?: boolean
  onLoadOlder?: () => void
  hasNewerMessages?: boolean
  isLoadingNewer?: boolean
  onLoadNewer?: () => void
  /** Whether there are buffered live WS events (agent is active while viewing old messages) */
  hasLiveActivity?: boolean
  /** Jump directly to the tail of conversation (reloads last messages) */
  onJumpToTail?: () => Promise<void>
  onRespondPermission: (toolCallId: string, allowed: boolean, remember?: { toolName: string }) => void
  onRespondInput: (requestId: string, response: string) => void
  onContinue?: () => void
  /** Quick action callback — inserts prompt into chat textarea */
  onQuickAction?: (prompt: string, cursorOffset?: number) => void
  /** Resume a previous conversation from welcome screen */
  onSelectSession?: (sessionId: string, turnIndex?: number, title?: string) => void
  /** Currently selected project (for welcome screen context) */
  selectedProject?: Project | null
}

export const ChatMessages = memo(function ChatMessages({
  messages,
  isStreaming,
  isLoadingHistory,
  isReplaying,
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder,
  hasNewerMessages,
  isLoadingNewer,
  onLoadNewer,
  hasLiveActivity,
  onJumpToTail,
  onRespondPermission,
  onRespondInput,
  onContinue,
  onQuickAction,
  onSelectSession,
  selectedProject,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const [scrollToTurn, setScrollToTurn] = useAtom(chatScrollToTurnAtom)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  // True while catching up to tail after clicking "New activity" badge
  const [isCatchingUp, setIsCatchingUp] = useState(false)

  // Track previous scrollHeight to preserve scroll position after prepending older messages
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingOlderRef = useRef(false)
  const isLoadingNewerRef = useRef(false)

  // Track the last message ID to detect prepend vs append.
  // If messages grow and the FIRST message ID changed → prepend (older messages loaded).
  // If messages grow and the LAST message ID changed → append (new message from stream/user).
  const firstMessageIdRef = useRef<string | null>(null)
  const prevMessageCountRef = useRef(0)

  // Keep refs in sync with props for use in scroll handler
  useEffect(() => {
    isLoadingOlderRef.current = !!isLoadingOlder
  }, [isLoadingOlder])

  useEffect(() => {
    isLoadingNewerRef.current = !!isLoadingNewer
  }, [isLoadingNewer])

  // Force auto-scroll OFF when a scroll target is pending — prevents race condition
  useEffect(() => {
    if (scrollToTurn !== null) {
      shouldAutoScrollRef.current = false
    }
  }, [scrollToTurn])

  // Reset catching-up state when live activity resolves (tail reached)
  useEffect(() => {
    if (!hasLiveActivity) {
      setIsCatchingUp(false)
    }
  }, [hasLiveActivity])

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

    // Forward infinite scroll: trigger load when near bottom
    if (
      scrollHeight - scrollTop - clientHeight < SCROLL_BOTTOM_THRESHOLD &&
      hasNewerMessages &&
      !isLoadingNewerRef.current &&
      onLoadNewer
    ) {
      onLoadNewer()
    }
  }, [hasOlderMessages, onLoadOlder, hasNewerMessages, onLoadNewer])

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

    const { createdAt, role, snippet } = scrollToTurn

    let targetIndex = -1

    // Strategy 1 (PRIMARY): match by content snippet.
    // The snippet from Meilisearch is the most reliable way to find the right message
    // since it directly matches the text content the user clicked on.
    if (snippet) {
      const clean = snippet.replace(/\.{3}$/, '').trim().toLowerCase()
      if (clean.length > 10) {
        // Try full snippet first
        targetIndex = messages.findIndex((m) =>
          m.blocks.some((b) => b.content?.toLowerCase().includes(clean)),
        )
        // If full snippet doesn't match (truncation/formatting), try first 40 chars
        if (targetIndex === -1) {
          const shorter = clean.slice(0, 40)
          if (shorter.length > 10) {
            targetIndex = messages.findIndex((m) =>
              m.blocks.some((b) => b.content?.toLowerCase().includes(shorter)),
            )
          }
        }
      }
    }

    // Strategy 2 (FALLBACK): match by timestamp + role.
    // An assistant message's timestamp is from its first event, but the search hit
    // created_at may be from any event in the turn (up to 60s later for long turns).
    // We find the message with matching role whose timestamp range contains the target.
    if (targetIndex === -1 && createdAt && role) {
      const targetMs = createdAt * 1000
      // For each message of the matching role, check if targetMs falls between
      // its timestamp and the next message's timestamp (or +120s for the last one).
      const candidates = messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.role === role)

      for (let ci = 0; ci < candidates.length; ci++) {
        const { m, i } = candidates[ci]
        const msgStart = m.timestamp.getTime()
        // The message "ends" at the start of the next message (or +120s for last)
        const nextMsg = candidates[ci + 1]
        const msgEnd = nextMsg ? nextMsg.m.timestamp.getTime() : msgStart + 120_000

        if (targetMs >= msgStart && targetMs <= msgEnd) {
          targetIndex = i
          break
        }
      }

      // If range-based didn't work, fall back to closest match within 120s
      if (targetIndex === -1) {
        let bestDelta = Infinity
        messages.forEach((m, i) => {
          if (m.role !== role) return
          const delta = Math.abs(m.timestamp.getTime() - targetMs)
          if (delta < bestDelta && delta < 120_000) {
            bestDelta = delta
            targetIndex = i
          }
        })
      }
    }

    if (targetIndex === -1) {
      setScrollToTurn(null)
      return
    }

    // Find the DOM element by data attribute.
    // Use a short delay to let the DOM fully render (messages contain markdown,
    // code blocks, tool results that take time to layout).
    // Then do a second corrective scroll after layout stabilizes.
    const scrollToElement = () => {
      const el = scrollRef.current?.querySelector(`[data-msg-index="${targetIndex}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' })
        setHighlightedIndex(targetIndex)
        // Second corrective scroll after layout fully stabilizes
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
        // Clear highlight after animation
        setTimeout(() => setHighlightedIndex(null), 3000)
      }
      setScrollToTurn(null)
    }
    // Wait for next frame + a small delay for DOM rendering
    requestAnimationFrame(() => setTimeout(scrollToElement, 50))
  }, [isReplaying, scrollToTurn, messages.length, setScrollToTurn])

  // Jump to tail: reload the last messages in one shot (used by "New activity" badge)
  const handleJumpToTail = useCallback(async () => {
    if (!onJumpToTail) return
    setIsCatchingUp(true)
    shouldAutoScrollRef.current = true
    await onJumpToTail()
    // After jump, scroll to the very bottom
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
  }, [onJumpToTail])

  if (messages.length === 0) {
    if (isLoadingHistory || isReplaying) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading messages...</span>
          </div>
        </div>
      )
    }
    return (
      <ChatWelcome
        onQuickAction={onQuickAction ?? (() => {})}
        onSelectSession={onSelectSession ?? (() => {})}
        selectedProject={selectedProject ?? null}
      />
    )
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4"
      >
      {/* Loading older messages spinner */}
      {isLoadingOlder && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
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
        <div
          key={msg.id}
          data-msg-index={index}
          className={
            highlightedIndex === index
              ? 'rounded-lg bg-amber-400/[0.06] ring-1 ring-amber-400/40 -mx-2 px-2 py-0.5 transition-all duration-500'
              : '-mx-2 px-2 py-0.5 transition-all duration-1000'
          }
        >
          <ChatMessageBubble
            message={msg}
            isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
            onRespondPermission={onRespondPermission}
            onRespondInput={onRespondInput}
            onContinue={onContinue}
          />
        </div>
      ))}

      {/* Loading newer messages spinner */}
      {isLoadingNewer && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          <span className="ml-2 text-xs text-gray-500">Loading newer messages...</span>
        </div>
      )}

      {/* "More messages below" indicator when not at tail */}
      {hasNewerMessages && !isLoadingNewer && (
        <div className="text-center text-[10px] text-gray-600 py-2 mt-2">
          — Scroll down for more —
        </div>
      )}

      {isStreaming && messages[messages.length - 1]?.role === 'user' && (
        <div className="mb-4 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_0.15s_infinite]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-[bounce_1s_ease-in-out_0.3s_infinite]" />
        </div>
      )}
      </div>

      {/* Floating badge: agent is active but user is viewing old messages */}
      {hasLiveActivity && (
        <button
          type="button"
          onClick={handleJumpToTail}
          disabled={isCatchingUp}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/90 border border-gray-700 text-gray-200 text-xs font-medium shadow-lg hover:bg-gray-700/90 disabled:opacity-70 disabled:cursor-wait transition-colors"
        >
          {isCatchingUp ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Catching up…
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              New activity ↓
            </>
          )}
        </button>
      )}
    </div>
  )
})
