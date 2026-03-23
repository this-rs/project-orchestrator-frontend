/**
 * useConversationWs — WebSocket-based real-time conversation hook.
 *
 * Connects to a chat session via WebSocket, handles authentication,
 * accumulates raw ChatEvents, and assembles them into ChatMessage[]
 * via historyEventsToMessages.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createWebSocket, ReadyState, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import type { ChatMessage } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 1500

/** Event types that are control-flow only (not accumulated as chat events). */
const CONTROL_EVENTS = new Set([
  'auth_ok',
  'auth_error',
  'replay_complete',
  'events_lagged',
  'session_dormant',
  'session_closed',
])

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConversationWs(sessionId: string | null) {
  const [rawEvents, setRawEvents] = useState<unknown[]>([])
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<IWebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const authenticatedRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Assemble ChatMessage[] from raw events via historyEventsToMessages
  const messages: ChatMessage[] = useMemo(
    () => historyEventsToMessages(rawEvents as Record<string, unknown>[]),
    [rawEvents],
  )

  // Mark the last assistant message as streaming when the WS is connected
  // (i.e., the agent is actively producing events)
  const messagesWithStreaming: ChatMessage[] = useMemo(() => {
    if (messages.length === 0) return messages
    const isAgentActive = status === 'connected'
    if (!isAgentActive) return messages

    // Clone messages array with last assistant message marked as streaming
    const result = [...messages]
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === 'assistant') {
        result[i] = { ...result[i], isStreaming: true }
        break
      }
    }
    return result
  }, [messages, status])

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
            if (data.type === 'session_closed') { shouldReconnectRef.current = false; setStatus('disconnected'); return }
            // Skip control events — don't accumulate them
            if (CONTROL_EVENTS.has(data.type)) return
            // Accumulate raw event for assembly
            setRawEvents(prev => [...prev, data])
          } catch { /* ignore parse errors */ }
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
  }, [])

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
    setRawEvents([])
    if (sessionId) {
      shouldReconnectRef.current = true
      reconnectAttemptsRef.current = 0
      connect()
    } else { setStatus('disconnected') }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return { messages: messagesWithStreaming, status }
}
