/**
 * WebSocket client of the Live Activity Hub (`/ws/activity`).
 *
 * Same shape as `EventBusClient` (ticket auth, exponential backoff, a single
 * "ready" handshake) because the backend treats both sockets identically: auth
 * is decided *before* the upgrade, and the client announces itself with a
 * `"ready"` message once its handlers are attached.
 *
 * What is specific here:
 * - **Replay cursor.** The server hands back a sequence number with every event.
 *   The client keeps the highest one it saw and passes it as `last_seq` on the
 *   next connection, so a reconnect (or a page that slept) receives the gap
 *   instead of a hole. A snapshot taken before connecting seeds the cursor.
 * - **Explicit gaps.** When the server's buffer overflowed or the socket lagged,
 *   it says so (`lag_dropped`). The client surfaces it instead of pretending the
 *   log is contiguous; the page then re-reads the snapshot.
 * - **No silent filter drift.** The query (project, categories, statuses) is
 *   part of the client: changing it reconnects with the new query, so what the
 *   user filtered is exactly what the server sends — never a client-side sieve
 *   over a stream that already dropped the interesting events.
 */
import { fetchWsTicket } from './auth'
import { wsUrl } from './env'
import { createWebSocket, ReadyState, type IWebSocket } from './wsAdapter'
import type { ActivityEvent, ActivityFrame } from '@/types/activity'

const MIN_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000

export type ActivityConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** What the server should send. Everything is optional: no filter, everything. */
export interface ActivityStreamQuery {
  projectId?: string
  workspaceSlug?: string
  /** Categories to keep (`plan_run`, `chat_session`, …). Empty = all. */
  categories?: string[]
  /** Statuses to keep. Empty = all. */
  statuses?: string[]
}

export interface ActivityStreamHandlers {
  onEvent: (event: ActivityEvent) => void
  onStatus: (status: ActivityConnectionStatus) => void
  /** The live stream is open; `seq` is where it starts, `replayed` what was caught up. */
  onReady?: (seq: number, replayed: number) => void
  /** `skipped` events were lost (server buffer or socket lag). */
  onGap?: (skipped: number) => void
}

function buildPath(query: ActivityStreamQuery, lastSeq: number | undefined, ticket: string | null): string {
  const params = new URLSearchParams()
  if (query.projectId) params.set('project_id', query.projectId)
  if (query.workspaceSlug) params.set('workspace_slug', query.workspaceSlug)
  if (query.categories && query.categories.length > 0) {
    params.set('entity_types', query.categories.join(','))
  }
  if (query.statuses && query.statuses.length > 0) params.set('statuses', query.statuses.join(','))
  if (lastSeq !== undefined && lastSeq > 0) params.set('last_seq', String(lastSeq))
  if (ticket) params.set('ticket', ticket)
  const qs = params.toString()
  return qs ? `/ws/activity?${qs}` : '/ws/activity'
}

export class ActivityStreamClient {
  private ws: IWebSocket | null = null
  private status: ActivityConnectionStatus = 'disconnected'
  private reconnectDelay = MIN_RECONNECT_DELAY
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false
  private authenticated = false
  private lastSeq: number

  constructor(
    private query: ActivityStreamQuery,
    private handlers: ActivityStreamHandlers,
    initialSeq = 0,
  ) {
    this.lastSeq = initialSeq
  }

  /** The last sequence number seen — the cursor a snapshot can resume from. */
  get cursor(): number {
    return this.lastSeq
  }

  get connectionStatus(): ActivityConnectionStatus {
    return this.status
  }

  /** Replace the query. Reconnects when it actually changed. */
  setQuery(query: ActivityStreamQuery) {
    if (JSON.stringify(query) === JSON.stringify(this.query)) return
    this.query = query
    if (this.shouldReconnect) {
      this.closeSocket()
      this.reconnectDelay = MIN_RECONNECT_DELAY
      void this.openSocket()
    }
  }

  /** Resume from `seq` (used when a snapshot is re-read after a gap). */
  setCursor(seq: number) {
    if (seq > this.lastSeq) this.lastSeq = seq
  }

  async connect() {
    if (this.ws?.readyState === ReadyState.OPEN || this.ws?.readyState === ReadyState.CONNECTING) {
      return
    }
    this.shouldReconnect = true
    await this.openSocket()
  }

  disconnect() {
    this.shouldReconnect = false
    this.authenticated = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.closeSocket()
    this.setStatus('disconnected')
  }

  private closeSocket() {
    if (!this.ws) return
    // Detach before closing so a late event cannot reach a disposed consumer.
    this.ws.onmessage = null
    this.ws.onclose = null
    this.ws.onerror = null
    this.ws.close()
    this.ws = null
  }

  private async openSocket() {
    this.authenticated = false
    this.setStatus(this.status === 'disconnected' ? 'connecting' : 'reconnecting')
    const ticket = await fetchWsTicket()
    const url = wsUrl(buildPath(this.query, this.lastSeq, ticket))

    try {
      this.ws = await createWebSocket(url, {
        onopen: () => {
          this.reconnectDelay = MIN_RECONNECT_DELAY
          // Tell the server our handlers are attached; it answers `auth_ok`,
          // then the replay, then the live stream.
          this.ws?.send('"ready"')
        },
        onmessage: (message) => {
          let frame: ActivityFrame | { type?: string }
          try {
            frame = JSON.parse(String(message.data))
          } catch {
            return
          }
          if (!this.authenticated) {
            // The backend sends `{"type":"auth_ok"}` before any activity frame.
            if ((frame as { type?: string }).type === 'auth_ok') {
              this.authenticated = true
              this.setStatus('connected')
            }
            return
          }
          this.handleFrame(frame as ActivityFrame)
        },
        onclose: () => {
          this.authenticated = false
          this.ws = null
          if (this.shouldReconnect) {
            this.setStatus('reconnecting')
            this.scheduleReconnect()
          } else {
            this.setStatus('disconnected')
          }
        },
        onerror: () => {
          // `onclose` always follows; reconnection is handled there.
        },
      })
    } catch {
      if (this.shouldReconnect) {
        this.setStatus('reconnecting')
        this.scheduleReconnect()
      }
    }
  }

  private handleFrame(frame: ActivityFrame) {
    switch (frame.kind) {
      case 'activity':
        if (frame.event.seq > this.lastSeq) this.lastSeq = frame.event.seq
        this.handlers.onEvent(frame.event)
        break
      case 'ready':
        this.handlers.onReady?.(frame.seq, frame.replayed)
        break
      case 'lag_dropped':
        this.handlers.onGap?.(frame.skipped)
        break
      default:
        break
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openSocket()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  private setStatus(status: ActivityConnectionStatus) {
    if (this.status === status) return
    this.status = status
    this.handlers.onStatus(status)
  }
}
