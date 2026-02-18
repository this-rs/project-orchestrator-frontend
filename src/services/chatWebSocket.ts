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
 *
 * Authentication:
 * - The browser sends the HttpOnly `refresh_token` cookie automatically
 *   during the WebSocket upgrade request (same-origin or CORS with credentials).
 * - In Tauri, the tauri-plugin-websocket Rust client bypasses WKWebView's
 *   Mixed Content restrictions. A WS ticket (fetched via fetch()) is passed
 *   as a query parameter for authentication.
 * - The server validates credentials BEFORE the upgrade and sends `auth_ok`
 *   as the first message — no client-side auth handshake needed.
 * - In no-auth mode, the server sends `auth_ok` automatically.
 */

import type { ChatEvent, WsChatClientMessage, WsConnectionStatus } from '@/types'
import { getAuthMode, fetchWsTicket } from './auth'
import { forceLogout } from './authManager'
import { wsUrl } from './env'
import { createWebSocket, ReadyState, type IWebSocket } from './wsAdapter'

const MIN_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const MAX_RECONNECT_ATTEMPTS = 10

export type ChatWsEventCallback = (event: ChatEvent & { seq?: number; replaying?: boolean }) => void
export type ChatWsStatusCallback = (status: WsConnectionStatus) => void
export type ChatWsReplayCompleteCallback = () => void

export class ChatWebSocket {
  private ws: IWebSocket | null = null
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
   * Connect to a chat session's WebSocket.
   * Auth is handled pre-upgrade: either via HttpOnly cookie (browsers)
   * or via a one-time ?ticket= query param (Tauri/WKWebView fallback).
   */
  async connect(sessionId: string, lastEventSeq: number = 0) {
    // Close existing connection if switching sessions
    if (this.ws && this._sessionId !== sessionId) {
      this.disconnect()
    }

    if (this.ws?.readyState === ReadyState.OPEN || this.ws?.readyState === ReadyState.CONNECTING) {
      return
    }

    this._sessionId = sessionId
    this._lastEventSeq = lastEventSeq
    this.shouldReconnect = true
    this._isReplaying = true

    this.setStatus('connecting')
    await this.openSocket(sessionId, lastEventSeq)
  }

  private async openSocket(sessionId: string, lastEventSeq: number) {
    const t0 = performance.now()
    // Fetch a one-time WS ticket before connecting.
    // This works around WKWebView (Tauri) not sending HttpOnly cookies
    // on WebSocket upgrade requests. In browsers the cookie is still sent
    // and takes priority server-side; the ticket is just a fallback.
    const ticket = await fetchWsTicket()
    // console.log(`⏱ [WS] fetchWsTicket: ${(performance.now() - t0).toFixed(0)}ms`)
    const params = new URLSearchParams({ last_event: String(lastEventSeq) })
    if (ticket) params.set('ticket', ticket)
    const url = wsUrl(`/ws/chat/${sessionId}?${params.toString()}`)

    try {
      // Use a "ready" flag so we can send "ready" either from onopen (browser)
      // or after createWebSocket resolves (Tauri). In Tauri mode, onopen fires
      // DURING init() before createWebSocket returns — this.ws is still null,
      // so we can't send from the callback. Instead we defer to after assignment.
      let readySent = false

      this.ws = await createWebSocket(url, {
        onopen: () => {
          // console.log(`⏱ [WS] onopen: ${(performance.now() - t0).toFixed(0)}ms`)
          this.reconnectDelay = MIN_RECONNECT_DELAY
          this.reconnectAttempts = 0
          // In browser mode, this.ws is already assigned (createWebSocket returned
          // synchronously for BrowserWebSocket). Send "ready" now.
          // In Tauri mode, this.ws is null here — readySent stays false, and we
          // send "ready" after createWebSocket resolves (below).
          if (this.ws) {
            this.ws.send('"ready"')
            readySent = true
          }
        },

        onmessage: (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string)

            // Handle auth response (first message from server)
            if (!this.authenticated) {
              if (data.type === 'auth_ok') {
                // console.log(`⏱ [WS] auth_ok received: ${(performance.now() - t0).toFixed(0)}ms`)
                this.authenticated = true
                this.setStatus('connected')
                return
              }
              if (data.type === 'auth_error') {
                this.shouldReconnect = false
                this.ws?.close()
                if (getAuthMode() === 'required') {
                  forceLogout()
                }
                return
              }
            }

            // Handle replay_complete marker
            if (data.type === 'replay_complete') {
              // console.log(`⏱ [WS] replay_complete: ${(performance.now() - t0).toFixed(0)}ms`)
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
              if (data.type === 'streaming_status' || data.type === 'partial_text' || data.type === 'stream_delta') {
                // console.log(`⏱ [WS] first ${data.type}: ${(performance.now() - t0).toFixed(0)}ms`)
              }
              this.onEvent(data as ChatEvent & { seq?: number; replaying?: boolean })
            }
          } catch {
            // Ignore malformed messages
          }
        },

        onclose: () => {
          this.ws = null
          this._isReplaying = false
          this.authenticated = false
          if (this.shouldReconnect) {
            this.setStatus('reconnecting')
            this.scheduleReconnect()
          } else {
            this.setStatus('disconnected')
          }
        },

        onerror: () => {
          // onclose will fire after onerror
        },
      })

      // In Tauri mode, onopen fired during init() when this.ws was still null,
      // so "ready" wasn't sent yet. Send it now that this.ws is assigned.
      if (!readySent && this.ws && this.ws.readyState === ReadyState.OPEN) {
        this.ws.send('"ready"')
      }
    } catch {
      this.scheduleReconnect()
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
      // Remove event handlers BEFORE closing to prevent in-flight messages
      // from being delivered to callbacks after disconnect(). The browser
      // can still fire onmessage between ws.close() and the actual onclose
      // event — without this, those stale events leak into the new session's
      // message state.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
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
    if (!this.ws || this.ws.readyState !== ReadyState.OPEN) {
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

  /**
   * Change the permission mode for the active CLI session mid-conversation
   */
  sendSetPermissionMode(mode: string) {
    return this.send({ type: 'set_permission_mode', mode })
  }

  /**
   * Change the model for the active CLI session mid-conversation
   */
  sendSetModel(model: string) {
    return this.send({ type: 'set_model', model })
  }

  /**
   * Toggle auto-continue for the active session (backend-managed)
   */
  sendSetAutoContinue(enabled: boolean) {
    return this.send({ type: 'set_auto_continue', enabled })
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
