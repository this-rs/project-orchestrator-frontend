/**
 * InlineConversation — full-width conversation panel shown below a wave.
 *
 * Features:
 * - Collapse/expand toggle with animated chevron + height transition
 * - Vertical resize via drag handle (min 200px, max 80vh)
 * - "Scroll to bottom" button when user scrolls up (auto-scroll detection)
 * - Enriched header: agent name, Badge status, elapsed duration, close button
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye,
  Loader2,
  X,
  ExternalLink,
  Square,
  ChevronDown,
  ArrowDown,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import { chatApi } from '@/services/chat'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { useConversationWs } from '@/hooks/runner'
import { MessageBubble } from './MessageBubble'
import { WsStatusIndicator } from './WsStatusIndicator'
import { formatElapsed, agentStatusConfig, agentStatusBadgeVariant } from './shared'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineConversationProps {
  sessionId: string
  taskTitle: string
  agentStatus?: string
  elapsedSecs?: number
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_HEIGHT = 200
const MAX_HEIGHT_VH = 0.8 // 80vh
const DEFAULT_HEIGHT = 400

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineConversation({
  sessionId,
  taskTitle,
  agentStatus,
  elapsedSecs,
  onClose,
}: InlineConversationProps) {
  const { messages, status } = useConversationWs(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wsSlug = useWorkspaceSlug()
  const [stopping, setStopping] = useState(false)

  // --- Collapse/expand state ---
  const [collapsed, setCollapsed] = useState(false)

  // --- Resize state ---
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(DEFAULT_HEIGHT)

  // --- Auto-scroll / "scroll to bottom" ---
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const userScrolledUp = useRef(false)

  // Compute max height in px
  const maxHeight = useMemo(
    () => typeof window !== 'undefined' ? Math.floor(window.innerHeight * MAX_HEIGHT_VH) : 600,
    [],
  )

  // --- Auto-scroll logic ---
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      userScrolledUp.current = false
      setShowScrollBtn(false)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isAtBottom = distFromBottom < 40
    userScrolledUp.current = !isAtBottom
    setShowScrollBtn(!isAtBottom && messages.length > 0)
  }, [messages.length])

  // Auto-scroll on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUp.current) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    } else {
      // Show the button since there are new messages below
      setShowScrollBtn(true)
    }
  }, [messages.length])

  // --- Drag resize handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartHeight.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [height])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientY - dragStartY.current
      const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, dragStartHeight.current + delta))
      setHeight(newHeight)
    }
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [maxHeight])

  // --- Stop handler ---
  const handleStop = useCallback(async () => {
    setStopping(true)
    try { await chatApi.interruptSession(sessionId) } catch { /* ignore */ }
    finally { setStopping(false) }
  }, [sessionId])

  // --- Badge config (use shared maps) ---
  const badgeVariant = agentStatus ? agentStatusBadgeVariant[agentStatus as keyof typeof agentStatusBadgeVariant] : null
  const badgeLabel = agentStatus ? agentStatusConfig[agentStatus as keyof typeof agentStatusConfig]?.label : null

  return (
    <div className="border border-indigo-500/20 rounded-lg bg-[#0d0d1a] overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-500/10 bg-indigo-500/[0.03]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Collapse/expand chevron */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-0.5 rounded text-gray-500 hover:text-gray-300 transition-transform duration-200 cursor-pointer"
            title={collapsed ? 'Expand conversation' : 'Collapse conversation'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>

          <Eye className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <h4 className="text-sm font-medium text-gray-200 truncate">{taskTitle}</h4>

          {/* Agent status badge */}
          {badgeVariant && badgeLabel && (
            <Badge variant={badgeVariant} className="text-[10px]">
              {badgeLabel}
            </Badge>
          )}

          <WsStatusIndicator status={status} />

          {/* Elapsed duration */}
          {elapsedSecs != null && elapsedSecs > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500 flex-shrink-0">
              <Clock className="w-3 h-3" />
              <span className="font-mono tabular-nums">{formatElapsed(elapsedSecs)}</span>
            </span>
          )}
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

      {/* Collapsible content with animated height */}
      <div
        className="transition-all duration-200 overflow-hidden relative"
        style={{
          maxHeight: collapsed ? 0 : height,
          opacity: collapsed ? 0 : 1,
        }}
      >
        {/* Messages area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-y-auto p-4 space-y-2"
          style={{ height: collapsed ? 0 : height - 8 }}
        >
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

        {/* Scroll-to-bottom FAB */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-medium
              shadow-lg shadow-indigo-500/20 backdrop-blur-sm transition-all duration-200 cursor-pointer"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            New messages
          </button>
        )}
      </div>

      {/* Drag handle for vertical resize */}
      {!collapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="h-2 cursor-row-resize flex items-center justify-center
            border-t border-indigo-500/10 bg-indigo-500/[0.02]
            hover:bg-indigo-500/[0.06] transition-colors group"
          title="Drag to resize"
        >
          <div className="w-8 h-0.5 rounded-full bg-gray-600 group-hover:bg-indigo-400 transition-colors" />
        </div>
      )}
    </div>
  )
}
