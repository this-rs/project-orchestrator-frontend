/**
 * useConversationWs — WebSocket-based real-time conversation hook.
 *
 * Connects to a chat session via WebSocket, handles authentication,
 * message parsing, and automatic reconnection with exponential backoff.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createWebSocket, ReadyState, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string
  type: 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'unknown'
  content: string
  timestamp: number
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 1500

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversationWs(sessionId: string | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<IWebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const authenticatedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
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

    if (d.type === 'assistant_message' || d.type === 'text') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.text === 'string' ? d.text : JSON.stringify(d)
      return { id, type: 'text', content, timestamp }
    }
    if (d.type === 'tool_use') {
      const name = (d.name as string) || 'tool'
      const input = d.input ? JSON.stringify(d.input, null, 2) : ''
      return { id, type: 'tool_use', content: `${name}\n${input}`, timestamp }
    }
    if (d.type === 'tool_result') {
      const content = typeof d.content === 'string'
        ? d.content
        : typeof d.output === 'string' ? d.output : JSON.stringify(d)
      return { id, type: 'tool_result', content, timestamp }
    }
    if (d.type === 'system') return { id, type: 'system', content: String(d.message || d.content || ''), timestamp }
    if (d.type === 'error') return { id, type: 'error', content: String(d.message || d.error || ''), timestamp }
    if (
      d.type === 'auth_ok' || d.type === 'auth_error' ||
      d.type === 'replay_complete' || d.type === 'events_lagged' ||
      d.type === 'session_dormant' || d.type === 'session_closed' ||
      d.type === 'result'
    ) return null
    if (d.content || d.text || d.message) {
      return { id, type: 'unknown', content: String(d.content || d.text || d.message), timestamp }
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
        onopen: () => { reconnectAttemptsRef.current = 0 },
        onmessage: (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string)
            if (!authenticatedRef.current) {
              if (data.type === 'auth_ok') { authenticatedRef.current = true; setStatus('connected'); return }
              if (data.type === 'auth_error') { shouldReconnectRef.current = false; wsRef.current?.close(); return }
            }
            if (data.type === 'replay_complete' || data.type === 'events_lagged' || data.type === 'session_dormant') return
            if (data.type === 'session_closed') { shouldReconnectRef.current = false; setStatus('disconnected'); return }
            const msg = parseMessage(data)
            if (msg) setMessages(prev => [...prev, msg])
          } catch { /* ignore */ }
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
        onerror: () => {},
      })
      wsRef.current = ws
      if (ws.readyState === ReadyState.OPEN) {
        ws.send('"ready"')
      } else if (ws.readyState === ReadyState.CONNECTING) {
        const origOnopen = ws.onopen
        ws.onopen = (ev: Event) => {
          if (origOnopen) (origOnopen as (ev: Event) => void)(ev)
          ws.send('"ready"')
        }
      }
    } catch { scheduleReconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseMessage])

  function scheduleReconnect() {
    if (reconnectTimerRef.current) return
    reconnectAttemptsRef.current++
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      setStatus('disconnected'); shouldReconnectRef.current = false; return
    }
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (shouldReconnectRef.current && sessionIdRef.current) connect()
    }, Math.min(delay, 30000))
  }

  useEffect(() => {
    cleanup()
    setMessages([])
    if (sessionId) {
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      connect()
    } else { setStatus('disconnected') }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return { messages, status }
}
