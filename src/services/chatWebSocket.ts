/**
 * ChatWebSocket — bidirectional WebSocket client for chat sessions.
 *
 * Replaces EventSource (SSE) + REST sendMessage/interrupt with a single
 * WebSocket connection per session.
 *
 * Features:
 * - Event replay on connect (from last_event sequence number)
 * - Automatic reconnection with exponential backoff
 * - lastEventSeq tracking for seamless reconnection
 * - Status change notifications
 */

import type { ChatEvent, WsChatClientMessage, WsConnectionStatus } from '@/types'
import { getAuthMode } from './auth'
import { getValidToken, forceLogout } from './authManager'

const MIN_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const MAX_RECONNECT_ATTEMPTS = 10

export type ChatWsEventCallback = (event: ChatEvent & { seq?: number; replaying?: boolean }) => void
export type ChatWsStatusCallback = (status: WsConnectionStatus) => void
export type ChatWsReplayCompleteCallback = () => void

export class ChatWebSocket {
  private ws: WebSocket | null = null
  private _lastEventSeq: number = 0
  private reconnectAttempts: number = 0
  private reconnectDelay: number = MIN_RECONNECT_DELAY
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect: boolean = true
  private _status: WsConnectionStatus = 'disconnected'
  private _sessionId: string | null = null
  private _isReplaying: boolean = false
  private authenticated: boolean = false

  private onEvent: ChatWsEventCallback | null = null
  private onStatusChange: ChatWsStatusCallback | null = null
  private onReplayComplete: ChatWsReplayCompleteCallback | null = null

  get status(): WsConnectionStatus {
    return this._status
  }

  get lastEventSeq(): number {
    return this._lastEventSeq
  }

  get sessionId(): string | null {
    return this._sessionId
  }

  get isReplaying(): boolean {
    return this._isReplaying
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: {
    onEvent?: ChatWsEventCallback
    onStatusChange?: ChatWsStatusCallback
    onReplayComplete?: ChatWsReplayCompleteCallback
  }) {
    if (callbacks.onEvent) this.onEvent = callbacks.onEvent
    if (callbacks.onStatusChange) this.onStatusChange = callbacks.onStatusChange
    if (callbacks.onReplayComplete) this.onReplayComplete = callbacks.onReplayComplete
  }

  /**
   * Connect to a chat session's WebSocket
   */
  connect(sessionId: string, lastEventSeq: number = 0) {
    // Close existing connection if switching sessions
    if (this.ws && this._sessionId !== sessionId) {
      this.disconnect()
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    this._sessionId = sessionId
    this._lastEventSeq = lastEventSeq
    this.shouldReconnect = true
    this._isReplaying = true

    this.setStatus('connecting')

    // In no-auth mode, connect directly. Otherwise pre-fetch a valid token.
    if (getAuthMode() === 'none') {
      this.openSocket(sessionId, lastEventSeq, null)
    } else {
      getValidToken().then((token) => {
        if (token) {
          this.openSocket(sessionId, lastEventSeq, token)
        } else {
          forceLogout()
        }
      })
    }
  }

  private openSocket(sessionId: string, lastEventSeq: number, token: string | null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/chat/${sessionId}?last_event=${lastEventSeq}`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = MIN_RECONNECT_DELAY
      this.reconnectAttempts = 0

      // In no-auth mode, skip auth handshake — server sends auth_ok automatically
      if (token && this.ws) {
        this.ws.send(JSON.stringify({ type: 'auth', token }))
      }
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string)

        // Handle auth response (first message from server)
        if (!this.authenticated) {
          if (data.type === 'auth_ok') {
            this.authenticated = true
            this.setStatus('connected')
            return
          }
          if (data.type === 'auth_error') {
            this.shouldReconnect = false
            this.ws?.close()
            forceLogout()
            return
          }
        }

        // Handle replay_complete marker
        if (data.type === 'replay_complete') {
          this._isReplaying = false
          this.onReplayComplete?.()
          return
        }

        // Handle events_lagged hint (client missed events)
        if (data.type === 'events_lagged') {
          console.warn(`Chat WS: lagged, ${data.skipped} events skipped`)
          return
        }

        // Handle session_closed
        if (data.type === 'session_closed') {
          this.shouldReconnect = false
          this.setStatus('disconnected')
          return
        }

        // Track lastEventSeq for reconnection
        if (typeof data.seq === 'number' && data.seq > this._lastEventSeq) {
          this._lastEventSeq = data.seq
        }

        // Forward as ChatEvent to the callback
        // The data has `type` field matching ChatEvent discriminant
        if (this.onEvent) {
          this.onEvent(data as ChatEvent & { seq?: number; replaying?: boolean })
        }
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this._isReplaying = false
      this.authenticated = false
      if (this.shouldReconnect) {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      } else {
        this.setStatus('disconnected')
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect() {
    this.shouldReconnect = false
    this._isReplaying = false
    this.authenticated = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._sessionId = null
    this.reconnectAttempts = 0
    this.reconnectDelay = MIN_RECONNECT_DELAY
    this.setStatus('disconnected')
  }

  /**
   * Send a message over the WebSocket
   */
  send(message: WsChatClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Chat WS: cannot send, not connected')
      return false
    }
    this.ws.send(JSON.stringify(message))
    return true
  }

  /**
   * Send a user message
   */
  sendUserMessage(content: string) {
    return this.send({ type: 'user_message', content })
  }

  /**
   * Send an interrupt signal
   */
  sendInterrupt() {
    return this.send({ type: 'interrupt' })
  }

  /**
   * Respond to a permission request
   */
  sendPermissionResponse(id: string, allow: boolean) {
    return this.send({ type: 'permission_response', id, allow })
  }

  /**
   * Respond to an input request
   */
  sendInputResponse(id: string, content: string) {
    return this.send({ type: 'input_response', id, content })
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private setStatus(status: WsConnectionStatus) {
    this._status = status
    this.onStatusChange?.(status)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return

    this.reconnectAttempts++
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error('Chat WS: max reconnect attempts reached')
      this.setStatus('disconnected')
      this.shouldReconnect = false
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this._sessionId && this.shouldReconnect) {
        // Reconnect with last known event seq for seamless replay
        this.connect(this._sessionId, this._lastEventSeq)
      }
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }
}
