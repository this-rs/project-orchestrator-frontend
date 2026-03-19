/**
 * ConversationPanel — live WebSocket conversation viewer for a runner agent.
 *
 * Connects to ws://.../ws/chat/{session_id} and renders messages in real-time.
 * Read-only view (no sending) — used to observe agent progress.
 *
 * Uses the existing wsAdapter (createWebSocket) for Tauri/browser compat,
 * and fetchWsTicket for auth.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { createWebSocket, ReadyState, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationMessage {
  id: string
  type: 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'unknown'
  content: string
  timestamp: number
}

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// ---------------------------------------------------------------------------
// Hook: useConversationWs
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 1500

function useConversationWs(sessionId: string | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<IWebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const authenticatedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  // Monotonically increasing message ID
  const nextIdRef = useRef(0)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onmessage = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
    authenticatedRef.current = false
  }, [])

  const parseMessage = useCallback((data: unknown): ConversationMessage | null => {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const id = String(++nextIdRef.current)
    const timestamp = Date.now()

    // assistant text
    if (d.type === 'assistant_message' || d.type === 'text') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.text === 'string'
          ? d.text
          : JSON.stringify(d)
      return { id, type: 'text', content, timestamp }
    }

    // tool use
    if (d.type === 'tool_use') {
      const name = (d.name as string) || 'tool'
      const input = d.input ? JSON.stringify(d.input, null, 2) : ''
      return { id, type: 'tool_use', content: `${name}\n${input}`, timestamp }
    }

    // tool result
    if (d.type === 'tool_result') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.output === 'string'
          ? d.output
          : JSON.stringify(d)
      return { id, type: 'tool_result', content, timestamp }
    }

    // system / error
    if (d.type === 'system') {
      return { id, type: 'system', content: String(d.message || d.content || ''), timestamp }
    }
    if (d.type === 'error') {
      return { id, type: 'error', content: String(d.message || d.error || ''), timestamp }
    }

    // Skip internal protocol messages
    if (
      d.type === 'auth_ok' || d.type === 'auth_error' ||
      d.type === 'replay_complete' || d.type === 'events_lagged' ||
      d.type === 'session_dormant' || d.type === 'session_closed' ||
      d.type === 'result'
    ) {
      return null
    }

    // Fallback: show as unknown if it has content
    if (d.content || d.text || d.message) {
      return {
        id,
        type: 'unknown',
        content: String(d.content || d.text || d.message),
        timestamp,
      }
    }

    return null
  }, [])

  const connect = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return

    setStatus('connecting')
    authenticatedRef.current = false

    try {
      const ticket = await fetchWsTicket()
      const params = new URLSearchParams({ last_event: '0' })
      if (ticket) params.set('ticket', ticket)
      const url = wsUrl(`/ws/chat/${sid}?${params.toString()}`)

      const ws = await createWebSocket(url, {
        onopen: () => {
          reconnectAttemptsRef.current = 0
          // Don't send here — wsRef may not be assigned yet.
          // We send "ready" after createWebSocket resolves (below).
        },

        onmessage: (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string)

            // Auth handshake
            if (!authenticatedRef.current) {
              if (data.type === 'auth_ok') {
                authenticatedRef.current = true
                setStatus('connected')
                return
              }
              if (data.type === 'auth_error') {
                shouldReconnectRef.current = false
                wsRef.current?.close()
                return
              }
            }

            // Skip replay_complete and other protocol messages
            if (data.type === 'replay_complete' || data.type === 'events_lagged' || data.type === 'session_dormant') {
              return
            }

            if (data.type === 'session_closed') {
              shouldReconnectRef.current = false
              setStatus('disconnected')
              return
            }

            const msg = parseMessage(data)
            if (msg) {
              setMessages(prev => [...prev, msg])
            }
          } catch {
            // Ignore malformed messages
          }
        },

        onclose: () => {
          wsRef.current = null
          authenticatedRef.current = false
          if (shouldReconnectRef.current && sessionIdRef.current === sid) {
            setStatus('reconnecting')
            scheduleReconnect()
          } else {
            setStatus('disconnected')
          }
        },

        onerror: () => {
          // onclose fires after onerror
        },
      })

      wsRef.current = ws

      // Send "ready" now that wsRef is assigned and the socket is open.
      // This covers both browser mode (onopen already fired) and Tauri mode.
      if (ws.readyState === ReadyState.OPEN) {
        ws.send('"ready"')
      } else if (ws.readyState === ReadyState.CONNECTING) {
        // Socket still connecting — wait for it to open before sending
        const origOnopen = ws.onopen
        ws.onopen = (ev: Event) => {
          if (origOnopen) (origOnopen as (ev: Event) => void)(ev)
          ws.send('"ready"')
        }
      }
    } catch {
      scheduleReconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseMessage])

  function scheduleReconnect() {
    if (reconnectTimerRef.current) return
    reconnectAttemptsRef.current++
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      setStatus('disconnected')
      shouldReconnectRef.current = false
      return
    }
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (shouldReconnectRef.current && sessionIdRef.current) {
        connect()
      }
    }, Math.min(delay, 30000))
  }

  // Connect / disconnect on sessionId change
  useEffect(() => {
    cleanup()
    setMessages([])

    if (sessionId) {
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      connect()
    } else {
      setStatus('disconnected')
    }

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return { messages, status }
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

const typeStyles: Record<ConversationMessage['type'], { label: string; border: string; bg: string; text: string }> = {
  text:        { label: 'Assistant', border: 'border-blue-500/20',   bg: 'bg-blue-500/[0.04]',   text: 'text-blue-400' },
  tool_use:    { label: 'Tool Use',  border: 'border-purple-500/20', bg: 'bg-purple-500/[0.04]', text: 'text-purple-400' },
  tool_result: { label: 'Result',    border: 'border-cyan-500/20',   bg: 'bg-cyan-500/[0.04]',   text: 'text-cyan-400' },
  system:      { label: 'System',    border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
  error:       { label: 'Error',     border: 'border-red-500/20',    bg: 'bg-red-500/[0.04]',    text: 'text-red-400' },
  unknown:     { label: 'Event',     border: 'border-gray-500/20',   bg: 'bg-white/[0.02]',      text: 'text-gray-500' },
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const style = typeStyles[message.type] ?? typeStyles.unknown

  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r-md px-3 py-2`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-medium uppercase ${style.text}`}>
          {style.label}
        </span>
      </div>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-60 overflow-y-auto">
        {message.content}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: WsStatus }) {
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-green-400">
        <Wifi className="w-3 h-3" />
        Live
      </span>
    )
  }
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-yellow-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        {status === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
      <WifiOff className="w-3 h-3" />
      Disconnected
    </span>
  )
}

// ---------------------------------------------------------------------------
// ConversationPanel
// ---------------------------------------------------------------------------

interface ConversationPanelProps {
  sessionId: string
  taskTitle: string
  onClose: () => void
}

export function ConversationPanel({ sessionId, taskTitle, onClose }: ConversationPanelProps) {
  const { messages, status } = useConversationWs(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  return (
    <div className="flex flex-col h-full border-l border-border-subtle bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-white/[0.02]">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-200 truncate">{taskTitle}</h3>
          <StatusIndicator status={status} />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">
              {status === 'connected'
                ? 'Waiting for messages...'
                : status === 'connecting'
                  ? 'Connecting to agent...'
                  : 'No messages yet'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  )
}
