import type { CrudEvent, EventBusStatus } from '@/types'
import { forceLogout } from './authManager'
import { wsUrl } from './env'

type EventCallback = (event: CrudEvent) => void
type StatusCallback = (status: EventBusStatus) => void

const MIN_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000

export class EventBusClient {
  private ws: WebSocket | null = null
  private listeners = new Set<EventCallback>()
  private statusListeners = new Set<StatusCallback>()
  private _status: EventBusStatus = 'disconnected'
  private reconnectDelay = MIN_RECONNECT_DELAY
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private authenticated = false

  get status() {
    return this._status
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.shouldReconnect = true
    this.authenticated = false

    // Auth is handled pre-upgrade via HttpOnly refresh_token cookie.
    // The browser sends the cookie automatically during the WS upgrade request.
    this.openSocket()
  }

  private openSocket() {
    const url = wsUrl('/ws/events')

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = MIN_RECONNECT_DELAY
      // Auth is done pre-upgrade via cookie — just wait for server's auth_ok
    }

    this.ws.onmessage = (event) => {
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
            forceLogout()
            return
          }
        }

        // Forward CRUD events to listeners
        const crudEvent = data as CrudEvent
        for (const listener of this.listeners) {
          listener(crudEvent)
        }
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.ws = null
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

  disconnect() {
    this.shouldReconnect = false
    this.authenticated = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  on(callback: EventCallback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  onStatus(callback: StatusCallback) {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
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
