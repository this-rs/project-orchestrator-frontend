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

  /** Timestamp when the page went hidden (visibility-based zombie detection). */
  private hiddenAt: number | null = null
  private visibilityListenerAttached = false

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
    this.attachVisibilityListener()

    this.setStatus('connecting')
    await this.openSocket(sessionId, lastEventSeq)
  }

  private async openSocket(sessionId: string, lastEventSeq: number) {
    // Fetch a one-time WS ticket before connecting.
    // This works around WKWebView (Tauri) not sending HttpOnly cookies
    // on WebSocket upgrade requests. In browsers the cookie is still sent
    // and takes priority server-side; the ticket is just a fallback.
    const ticket = await fetchWsTicket()
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
              this._isReplaying = false
              this.onReplayComplete?.()
              return
            }

            // Handle events_lagged (client missed events — server's broadcast
            // buffer overflowed, typically after mobile suspension).
            //
            // The skipped events are gone from the live stream FOREVER — if the
            // assistant's whole response was in the gap, the UI would sit on
            // "…" while other devices (whose receivers didn't lag) stream fine.
            // Recovery: force-reconnect with _lastEventSeq — the server replays
            // the gap from its event log (Phase 1 replay) and the UI catches up.
            if (data.type === 'events_lagged') {
              console.warn(`Chat WS: lagged, ${data.skipped} events skipped — resyncing via replay`)
              this.forceReconnect('events_lagged')
              return
            }

            // Handle session_dormant (CLI cleaned up due to idle timeout, WS stays alive)
            // The user can still send messages — resume_session() will spawn a fresh CLI.
            if (data.type === 'session_dormant') {
              console.info('Chat WS: session dormant (CLI idle cleanup). Will resume on next message.')
              return
            }

            // Handle session_closed (explicit close — future use)
            if (data.type === 'session_closed') {
              this.shouldReconnect = false
              this.setStatus('disconnected')
              return
            }

            // Track lastEventSeq for reconnection.
            // When the initial connection uses MAX_SAFE_INTEGER (skip-replay mode),
            // no real seq will ever exceed it, so we'd never update. Fix: if
            // _lastEventSeq is above the skip-replay threshold, accept the first
            // real seq we see — then subsequent events update normally via >.
            if (typeof data.seq === 'number' && data.seq > 0) {
              if (this._lastEventSeq >= 1_000_000_000_000 || data.seq > this._lastEventSeq) {
                this._lastEventSeq = data.seq
              }
            }

            // Forward as ChatEvent to the callback
            // The data has `type` field matching ChatEvent discriminant
            if (this.onEvent) {
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
    this.detachVisibilityListener()
    this.hiddenAt = null
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
   * Send a message over the WebSocket.
   *
   * Returns false when the socket is unusable — and, crucially, TRIGGERS a
   * reconnect instead of failing silently. Before this, a send on a dead
   * socket left the UI stuck on the typing indicator forever: the caller
   * ignored the false return, no reconnect was ever scheduled (no close event
   * fires on an already-dead socket), and the session never resynced.
   * Callers can queue the message and retry after `onReplayComplete`.
   */
  send(message: WsChatClientMessage) {
    if (!this.ws || this.ws.readyState !== ReadyState.OPEN) {
      console.warn('Chat WS: cannot send, not connected — forcing reconnect')
      this.forceReconnect('send on dead socket')
      return false
    }
    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch (err) {
      // Some WebViews throw on send over a half-open socket instead of
      // reporting a non-OPEN readyState.
      console.warn('Chat WS: send threw — forcing reconnect', err)
      this.forceReconnect('send threw')
      return false
    }
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

  /**
   * Discard the current socket (possibly half-open) and reconnect IMMEDIATELY
   * with `_lastEventSeq` so the server replays every missed event.
   *
   * This is the recovery primitive for the three "stuck on typing indicator"
   * holes: `events_lagged` (server skipped events), send on a dead socket,
   * and returning from mobile background with a zombie connection. In all
   * three cases the socket never fires `onclose`, so the regular
   * reconnect-on-close path never runs — we have to force it.
   */
  private forceReconnect(reason: string) {
    if (!this._sessionId || !this.shouldReconnect) return
    // Already in the middle of establishing a fresh connection — let it finish.
    if (this.ws?.readyState === ReadyState.CONNECTING) return

    console.warn(`Chat WS: force reconnect (${reason})`)

    if (this.ws) {
      // Strip handlers BEFORE closing so the zombie's close event can't
      // double-schedule a backoff reconnect on top of the immediate one.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      try {
        this.ws.close()
      } catch {
        // Socket already dead — exactly why we're here.
      }
      this.ws = null
    }

    this.authenticated = false
    this._isReplaying = true
    this.setStatus('reconnecting')
    // Immediate reconnect; on failure openSocket falls back to the
    // exponential-backoff scheduleReconnect path.
    void this.openSocket(this._sessionId, this._lastEventSeq)
  }

  /**
   * Visibility-based zombie detection (mobile).
   *
   * iOS/Android suspend the page in background: the socket dies on the wire
   * WITHOUT any close event — JS still sees `readyState === OPEN`. The
   * server's 30s protocol pings are invisible to browser JS, so nothing on
   * the client ever notices. On return to foreground, reconnect when the
   * socket is observably dead OR when we were hidden long enough (> the
   * server ping interval) for the connection to have been reaped. Replay
   * makes a spurious reconnect cheap — a missed one costs the whole stream.
   */
  private readonly handleVisibilityChange = () => {
    if (typeof document === 'undefined') return

    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now()
      return
    }

    const hiddenForMs = this.hiddenAt !== null ? Date.now() - this.hiddenAt : 0
    this.hiddenAt = null

    if (!this._sessionId || !this.shouldReconnect) return

    const socketDead = !this.ws || this.ws.readyState !== ReadyState.OPEN
    const likelyZombie = hiddenForMs > 45_000 // > server ping interval (30s)

    if (socketDead || likelyZombie) {
      this.forceReconnect(
        socketDead ? 'visible with dead socket' : `visible after ${Math.round(hiddenForMs / 1000)}s hidden`,
      )
    }
  }

  private attachVisibilityListener() {
    if (this.visibilityListenerAttached || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.visibilityListenerAttached = true
  }

  private detachVisibilityListener() {
    if (!this.visibilityListenerAttached || typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.visibilityListenerAttached = false
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
