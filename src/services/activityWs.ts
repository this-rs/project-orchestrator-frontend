/**
 * ActivityWebSocket — client wrapper around `/ws/activity` (Live Activity Hub).
 *
 * Backend contract: `src/api/ws_activity_handler.rs`.
 *
 * Features
 * - Subscribes to a project's activity stream (multiplexed RunnerEvents +
 *   CRUD on `{Plan, Task, ProtocolRun, ChatSession}` + protocol progress)
 * - Automatic reconnect with exponential backoff (1s → 2s → 4s → … → 30s)
 * - `lastEventSeq` tracking so the next connect can replay events from the
 *   server-side ring buffer (replay limited to ~1000 events)
 * - Pre-upgrade auth: HttpOnly cookie (browser) or `?ticket=` (Tauri) — exactly
 *   the same handshake as ChatWebSocket
 *
 * Wire frames (see `ActivityWsFrame` in `@/types`):
 *   { "type": "auth_ok" }
 *   { "type": "connected", "last_seq": N, "replayed": K }
 *   { "type": "activity", "event": { kind: "runner" | "chat" | "crud" | "protocol_progress", ... } }
 *   { "type": "lag_dropped", "skipped": M }
 *
 * The client sends `"ready"` (JSON string literal) as the upgrade handshake
 * trigger — mirrors `ChatWebSocket` so the backend can share the
 * `wait_ready_then_auth_ok` helper.
 */

import type {
  ActivityEvent,
  ActivityFilters,
  AnyActivityWsFrame,
  EventSeq,
  WsConnectionStatus,
} from '@/types'
import { fetchWsTicket, getAuthMode } from './auth'
import { forceLogout } from './authManager'
import { wsUrl } from './env'
import { createWebSocket, ReadyState, type IWebSocket } from './wsAdapter'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10

// ---------------------------------------------------------------------------
// Callback signatures
// ---------------------------------------------------------------------------

export type ActivityEventCallback = (event: ActivityEvent) => void
export type ActivityStatusCallback = (status: WsConnectionStatus) => void
export type ActivityConnectedCallback = (head: { last_seq: EventSeq; replayed: number }) => void
export type ActivityLagCallback = (skipped: number) => void

export interface ActivityWebSocketCallbacks {
  onEvent?: ActivityEventCallback
  onStatusChange?: ActivityStatusCallback
  /** Fired after `connected` frame — useful to switch UI from "connecting" → "live". */
  onConnected?: ActivityConnectedCallback
  /** Fired on `lag_dropped` (the client must resync via REST snapshot). */
  onLagDropped?: ActivityLagCallback
}

// ---------------------------------------------------------------------------
// ActivityWebSocket
// ---------------------------------------------------------------------------

/**
 * Client for the Live Activity Hub WebSocket stream.
 *
 * One instance handles **one project at a time**. Switching projects:
 *
 *   ws.disconnect()
 *   ws.connect({ project_id: '…', last_event_seq: 0 })
 *
 * Memory: the client only retains `lastEventSeq` and the configured filters —
 * the snapshot itself stays in the React reducer state managed by
 * `useActivityStream`.
 */
export class ActivityWebSocket {
  private ws: IWebSocket | null = null
  private _filters: ActivityFilters | null = null
  private _lastEventSeq: EventSeq = 0
  private reconnectAttempts = 0
  private reconnectDelay: number = MIN_RECONNECT_DELAY_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private _status: WsConnectionStatus = 'disconnected'
  private authenticated = false

  private onEvent: ActivityEventCallback | null = null
  private onStatusChange: ActivityStatusCallback | null = null
  private onConnected: ActivityConnectedCallback | null = null
  private onLagDropped: ActivityLagCallback | null = null

  // -- public read-only getters --------------------------------------------

  get status(): WsConnectionStatus {
    return this._status
  }

  /** Highest `seq` observed so far. Persisted across reconnects for replay. */
  get lastEventSeq(): EventSeq {
    return this._lastEventSeq
  }

  get filters(): ActivityFilters | null {
    return this._filters
  }

  // -- callback wiring ------------------------------------------------------

  setCallbacks(callbacks: ActivityWebSocketCallbacks) {
    if (callbacks.onEvent !== undefined) this.onEvent = callbacks.onEvent ?? null
    if (callbacks.onStatusChange !== undefined) this.onStatusChange = callbacks.onStatusChange ?? null
    if (callbacks.onConnected !== undefined) this.onConnected = callbacks.onConnected ?? null
    if (callbacks.onLagDropped !== undefined) this.onLagDropped = callbacks.onLagDropped ?? null
  }

  // -- lifecycle ------------------------------------------------------------

  /**
   * Open the WebSocket for a given project.
   *
   * @param filters       Project + optional event-type / status filters.
   * @param lastEventSeq  Replay events with `seq > lastEventSeq` from the
   *                      backend ring buffer. Pass `snapshot.last_event_seq`
   *                      from the REST snapshot to avoid the empty-screen gap.
   */
  async connect(filters: ActivityFilters, lastEventSeq: EventSeq = 0) {
    // Switch projects: close any in-flight connection cleanly.
    if (this.ws && this._filters?.project_id !== filters.project_id) {
      this.disconnect()
    }

    if (this.ws?.readyState === ReadyState.OPEN || this.ws?.readyState === ReadyState.CONNECTING) {
      // Already connected (possibly mid-handshake) for the same project.
      return
    }

    this._filters = filters
    this._lastEventSeq = lastEventSeq
    this.shouldReconnect = true
    this.setStatus('connecting')
    await this.openSocket(filters, lastEventSeq)
  }

  /**
   * Tear down the WebSocket. After `disconnect()` no reconnect is attempted
   * unless `connect()` is called again.
   */
  disconnect() {
    this.shouldReconnect = false
    this.authenticated = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      // Detach handlers BEFORE closing so any in-flight frames after close
      // don't leak into stale callbacks.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.reconnectAttempts = 0
    this.reconnectDelay = MIN_RECONNECT_DELAY_MS
    this.setStatus('disconnected')
  }

  // -- internals ------------------------------------------------------------

  private async openSocket(filters: ActivityFilters, lastEventSeq: EventSeq) {
    const ticket = await fetchWsTicket()
    const params = new URLSearchParams({ project_id: filters.project_id })
    if (lastEventSeq > 0) params.set('lastEventSeq', String(lastEventSeq))
    if (filters.entity_types && filters.entity_types.length > 0) {
      params.set('entity_types', filters.entity_types.join(','))
    }
    if (filters.statuses && filters.statuses.length > 0) {
      params.set('statuses', filters.statuses.join(','))
    }
    if (ticket) params.set('ticket', ticket)
    const url = wsUrl(`/ws/activity?${params.toString()}`)

    try {
      // Tracks whether we've already sent "ready" — mirrors ChatWebSocket
      // because the Tauri adapter fires onopen during init() before the
      // assignment to `this.ws`.
      let readySent = false

      this.ws = await createWebSocket(url, {
        onopen: () => {
          this.reconnectDelay = MIN_RECONNECT_DELAY_MS
          this.reconnectAttempts = 0
          if (this.ws) {
            this.ws.send('"ready"')
            readySent = true
          }
        },

        onmessage: (event: MessageEvent) => {
          this.handleMessage(event.data as string)
        },

        onclose: () => {
          this.ws = null
          this.authenticated = false
          if (this.shouldReconnect) {
            this.setStatus('reconnecting')
            this.scheduleReconnect()
          } else {
            this.setStatus('disconnected')
          }
        },

        onerror: () => {
          // onclose follows — let it drive reconnect.
        },
      })

      // Tauri path: onopen fired before this.ws was assigned.
      if (!readySent && this.ws && this.ws.readyState === ReadyState.OPEN) {
        this.ws.send('"ready"')
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private handleMessage(raw: string) {
    let data: AnyActivityWsFrame
    try {
      data = JSON.parse(raw) as AnyActivityWsFrame
    } catch {
      return
    }

    // Auth handshake — first frame after `"ready"`.
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
      // Any other frame before auth_ok is unexpected — drop it.
      return
    }

    switch (data.type) {
      case 'connected': {
        // Note: `last_seq` in the `connected` frame is the **server's current
        // head** at handshake time. The replayed events that just arrived
        // have updated `_lastEventSeq` already; we keep the larger value.
        if (data.last_seq > this._lastEventSeq) {
          this._lastEventSeq = data.last_seq
        }
        this.onConnected?.({ last_seq: data.last_seq, replayed: data.replayed })
        return
      }

      case 'lag_dropped': {
        this.onLagDropped?.(data.skipped)
        return
      }

      case 'activity': {
        const evt = data.event
        if (typeof evt.seq === 'number' && evt.seq > this._lastEventSeq) {
          this._lastEventSeq = evt.seq
        }
        this.onEvent?.(evt)
        return
      }

      default:
        // Unknown frame type — ignore to remain forward-compatible.
        return
    }
  }

  private setStatus(status: WsConnectionStatus) {
    if (this._status === status) return
    this._status = status
    this.onStatusChange?.(status)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return

    this.reconnectAttempts++
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error('Activity WS: max reconnect attempts reached')
      this.setStatus('disconnected')
      this.shouldReconnect = false
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this._filters && this.shouldReconnect) {
        // Reconnect with the highest seq we've seen → server replays the gap.
        this.connect(this._filters, this._lastEventSeq)
      }
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }
}
