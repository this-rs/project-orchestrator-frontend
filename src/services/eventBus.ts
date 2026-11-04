import type { CrudEvent, EventBusStatus, GraphEvent } from '@/types'
import { getAuthMode, fetchWsTicket } from './auth'
import { forceLogout } from './authManager'
import { wsUrl } from './env'
import { createWebSocket, ReadyState, type IWebSocket } from './wsAdapter'

type EventCallback = (event: CrudEvent) => void
type GraphEventCallback = (event: GraphEvent) => void
type StatusCallback = (status: EventBusStatus) => void

/** A chat frame relayed for a watched session: `{kind:"chat", session_id, event}`. */
type ChatFrameCallback = (sessionId: string, event: unknown) => void

const MIN_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
/** The backend refuses a `?sessions=` list longer than this (MAX_MUX_SESSIONS). */
const MAX_WATCHED_SESSIONS = 64
/** Watching a session means reopening the socket: changes within this window share one reopening. */
const SESSIONS_REOPEN_MS = 400

export class EventBusClient {
  private ws: IWebSocket | null = null
  private listeners = new Set<EventCallback>()
  private graphListeners = new Set<GraphEventCallback>()
  private statusListeners = new Set<StatusCallback>()
  private _status: EventBusStatus = 'disconnected'
  private reconnectDelay = MIN_RECONNECT_DELAY
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private authenticated = false
  private chatListeners = new Set<ChatFrameCallback>()
  /** Sessions each caller wants watched; the socket carries their union. */
  private sessionOwners = new Map<string, string[]>()
  /** The `?sessions=` list the open socket was built with. */
  private openedSessions = ''
  private sessionsTimer: ReturnType<typeof setTimeout> | null = null

  get status() {
    return this._status
  }

  /** Sorted union of every owner's sessions, capped at what the backend accepts. */
  private watchedSessions(): string[] {
    const all = new Set<string>()
    for (const ids of this.sessionOwners.values()) for (const id of ids) all.add(id)
    return [...all].sort().slice(0, MAX_WATCHED_SESSIONS)
  }

  /**
   * Ask for the chat events of these sessions (`owner` is the caller: it only
   * ever replaces its own list, so two screens cannot erase each other's).
   * Opt-in on the backend and fixed at connection time, so a change reopens the
   * socket — once, after a short settle, and without touching the status.
   */
  setSessions(owner: string, ids: readonly string[]) {
    if (ids.length === 0) this.sessionOwners.delete(owner)
    else this.sessionOwners.set(owner, [...new Set(ids)])
    this.scheduleSessionsReopen()
  }

  /** Subscribe to the chat frames of the watched sessions. */
  onChatFrame(callback: ChatFrameCallback) {
    this.chatListeners.add(callback)
    return () => this.chatListeners.delete(callback)
  }

  private scheduleSessionsReopen() {
    if (!this.ws || this.watchedSessions().join(',') === this.openedSessions) return
    if (this.sessionsTimer) clearTimeout(this.sessionsTimer)
    this.sessionsTimer = setTimeout(() => {
      this.sessionsTimer = null
      if (!this.shouldReconnect || !this.ws || this.watchedSessions().join(',') === this.openedSessions) return
      // Same teardown as disconnect(), minus the status: the screen keeps
      // showing "connected" through a reopening that takes a moment.
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
      this.authenticated = false
      this.reconnectDelay = MIN_RECONNECT_DELAY
      void this.openSocket()
    }, SESSIONS_REOPEN_MS)
  }

  async connect() {
    if (this.ws?.readyState === ReadyState.OPEN || this.ws?.readyState === ReadyState.CONNECTING) {
      return
    }

    this.shouldReconnect = true
    this.authenticated = false
    await this.openSocket()
  }

  private async openSocket() {
    // Fetch a one-time WS ticket before connecting.
    // This works around WKWebView (Tauri) not sending HttpOnly cookies
    // on WebSocket upgrade requests. In browsers the cookie is still sent
    // and takes priority server-side; the ticket is just a fallback.
    const ticket = await fetchWsTicket()
    const watched = this.watchedSessions()
    const query = [
      ticket ? `ticket=${ticket}` : '',
      watched.length > 0 ? `sessions=${encodeURIComponent(watched.join(','))}` : '',
    ]
      .filter(Boolean)
      .join('&')
    const path = query ? `/ws/events?${query}` : '/ws/events'
    const url = wsUrl(path)
    this.openedSessions = watched.join(',')

    // console.log('[EventBus] Opening socket, ticket:', ticket ? 'obtained' : 'null', 'url:', url)
    try {
      this.ws = await createWebSocket(url, {
        onopen: () => {
          // console.log('[EventBus] WebSocket opened')
          this.reconnectDelay = MIN_RECONNECT_DELAY
          // Auth is handled pre-upgrade: either via HttpOnly cookie (browsers)
          // or via the ?ticket= query param (Tauri/WKWebView fallback).
          // The server waits for a "ready" signal before sending auth_ok.
        },

        onmessage: (event) => {
          try {
            const data = JSON.parse(event.data)

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

            // Route by message kind
            if (data.kind === 'graph_batch') {
              // Batched graph events: {kind: "graph_batch", events: [...], count: N}
              const events = data.events as GraphEvent[]
              if (Array.isArray(events)) {
                for (const ge of events) {
                  this.dispatchGraphEvent(ge)
                }
              }
            } else if (data.kind === 'graph') {
              // Individual graph event
              this.dispatchGraphEvent(data as GraphEvent)
            } else if (data.kind === 'chat') {
              // A watched session's event: {kind: "chat", session_id, event}
              if (typeof data.session_id === 'string' && data.event != null) {
                for (const listener of this.chatListeners) listener(data.session_id, data.event)
              }
            } else {
              // Forward CRUD events to listeners
              const crudEvent = data as CrudEvent
              for (const listener of this.listeners) {
                listener(crudEvent)
              }
            }
          } catch {
            // ignore malformed messages (e.g. ping frames)
          }
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
          // onclose will fire after onerror
        },
      })

      // Send "ready" to tell the server our message listener is registered.
      // The server waits for this before sending auth_ok, preventing a race
      // condition with the Tauri WebSocket plugin where messages sent before
      // addListener() is called are lost.
      if (this.ws && this.ws.readyState === ReadyState.OPEN) {
        // console.log('[EventBus] Sending "ready" to server')
        this.ws.send('"ready"')
      }
      // Sessions may have changed while the socket was being opened.
      this.scheduleSessionsReopen()
    } catch (err) {
      console.error('[EventBus] createWebSocket failed:', err)
      this.scheduleReconnect()
    }
  }

  disconnect() {
    this.shouldReconnect = false
    this.authenticated = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.sessionsTimer) {
      clearTimeout(this.sessionsTimer)
      this.sessionsTimer = null
    }
    if (this.ws) {
      // Detach handlers before closing to prevent stale events
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  on(callback: EventCallback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /** Subscribe to graph events (node/edge/reinforcement/activation/community). */
  onGraph(callback: GraphEventCallback) {
    this.graphListeners.add(callback)
    return () => this.graphListeners.delete(callback)
  }

  onStatus(callback: StatusCallback) {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }

  private dispatchGraphEvent(event: GraphEvent) {
    for (const listener of this.graphListeners) {
      listener(event)
    }
  }

  private setStatus(status: EventBusStatus) {
    this._status = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }
}

// Singleton
let instance: EventBusClient | null = null

export function getEventBus(): EventBusClient {
  if (!instance) {
    instance = new EventBusClient()
  }
  return instance
}
