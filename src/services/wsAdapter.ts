/**
 * WebSocket Adapter — unified interface for browser and Tauri environments.
 *
 * In browser mode, uses the native WebSocket API directly.
 * In Tauri mode, uses @tauri-apps/plugin-websocket which creates a Rust-native
 * WebSocket client that bypasses WKWebView's Mixed Content restrictions
 * (https://tauri.localhost/ blocks ws:// connections).
 *
 * Both implementations expose the same IWebSocket interface so that consumers
 * (EventBusClient, ChatWebSocket) are environment-agnostic.
 */

import { isTauri } from './env'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export const enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface IWebSocket {
  readonly readyState: ReadyState

  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onerror: ((ev: Event) => void) | null

  send(data: string): void
  close(code?: number, reason?: string): void
}

// ---------------------------------------------------------------------------
// Browser implementation — thin wrapper around native WebSocket
// ---------------------------------------------------------------------------

class BrowserWebSocket implements IWebSocket {
  private ws: WebSocket

  get readyState(): ReadyState {
    return this.ws.readyState as ReadyState
  }

  get onopen() { return this.ws.onopen as ((ev: Event) => void) | null }
  set onopen(cb: ((ev: Event) => void) | null) { this.ws.onopen = cb }

  get onmessage() { return this.ws.onmessage as ((ev: MessageEvent) => void) | null }
  set onmessage(cb: ((ev: MessageEvent) => void) | null) { this.ws.onmessage = cb }

  get onclose() { return this.ws.onclose as ((ev: CloseEvent) => void) | null }
  set onclose(cb: ((ev: CloseEvent) => void) | null) { this.ws.onclose = cb }

  get onerror() { return this.ws.onerror as ((ev: Event) => void) | null }
  set onerror(cb: ((ev: Event) => void) | null) { this.ws.onerror = cb }

  constructor(url: string) {
    this.ws = new WebSocket(url)
  }

  send(data: string): void {
    this.ws.send(data)
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}

// ---------------------------------------------------------------------------
// Tauri implementation — wraps @tauri-apps/plugin-websocket
// ---------------------------------------------------------------------------

/**
 * TauriWebSocket adapts the Tauri plugin API to the IWebSocket interface.
 *
 * Key differences from native WebSocket:
 * - connect() is async (returns Promise<WebSocket>)
 * - Messages arrive via addListener(cb) as MessageKind objects, not MessageEvent
 * - send() is async (returns Promise<void>)
 * - disconnect() is async (returns Promise<void>)
 * - No readyState property on the plugin — we track it manually
 */
class TauriWebSocket implements IWebSocket {
  private _readyState: ReadyState = ReadyState.CONNECTING
  private tauriWs: Awaited<ReturnType<typeof import('@tauri-apps/plugin-websocket').default.connect>> | null = null
  private unsubscribe: (() => void) | null = null

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  get readyState(): ReadyState {
    return this._readyState
  }

  /**
   * Initialize the Tauri WebSocket connection.
   * Called by the factory — not the constructor (because connect is async).
   */
  async init(url: string): Promise<void> {
    try {
      // console.log('[TauriWS] Connecting to:', url)
      const TauriWS = (await import('@tauri-apps/plugin-websocket')).default
      // console.log('[TauriWS] Plugin loaded, calling connect()...')
      this.tauriWs = await TauriWS.connect(url)
      // console.log('[TauriWS] Connected successfully, id:', this.tauriWs.id)

      // Subscribe to messages
      this.unsubscribe = this.tauriWs.addListener((msg) => {
        switch (msg.type) {
          case 'Text':
            if (this.onmessage) {
              // Create a MessageEvent-like object with the text data
              const event = new MessageEvent('message', { data: msg.data })
              this.onmessage(event)
            }
            break

          case 'Binary':
            if (this.onmessage) {
              const event = new MessageEvent('message', {
                data: new Uint8Array(msg.data).buffer,
              })
              this.onmessage(event)
            }
            break

          case 'Close':
            this._readyState = ReadyState.CLOSED
            if (this.onclose) {
              const code = msg.data?.code ?? 1000
              const reason = msg.data?.reason ?? ''
              const event = new CloseEvent('close', { code, reason, wasClean: true })
              this.onclose(event)
            }
            this.cleanup()
            break

          case 'Ping':
          case 'Pong':
            // Handled automatically by the Rust client — ignore
            break
        }
      })

      // Connection succeeded — mark as OPEN
      this._readyState = ReadyState.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    } catch (err) {
      console.error('[TauriWS] Connection failed:', err)
      this._readyState = ReadyState.CLOSED
      if (this.onerror) {
        this.onerror(new Event('error'))
      }
      // Also fire onclose so the reconnect logic triggers
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code: 1006, reason: 'Connection failed', wasClean: false }))
      }
    }
  }

  send(data: string): void {
    if (this._readyState !== ReadyState.OPEN || !this.tauriWs) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError')
    }
    // send() is async on the Tauri plugin but IWebSocket.send() is sync.
    // Fire-and-forget — errors will surface via the listener as Close events.
    this.tauriWs.send(data).catch((err) => {
      console.error('TauriWebSocket send error:', err)
      if (this.onerror) {
        this.onerror(new Event('error'))
      }
    })
  }

  close(_code?: number, _reason?: string): void {
    if (this._readyState === ReadyState.CLOSED || this._readyState === ReadyState.CLOSING) {
      return
    }
    this._readyState = ReadyState.CLOSING
    if (this.tauriWs) {
      this.tauriWs.disconnect().then(() => {
        this._readyState = ReadyState.CLOSED
        if (this.onclose) {
          this.onclose(new CloseEvent('close', { code: 1000, reason: '', wasClean: true }))
        }
        this.cleanup()
      }).catch(() => {
        this._readyState = ReadyState.CLOSED
        if (this.onclose) {
          this.onclose(new CloseEvent('close', { code: 1006, reason: 'Disconnect failed', wasClean: false }))
        }
        this.cleanup()
      })
    } else {
      this._readyState = ReadyState.CLOSED
    }
  }

  private cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.tauriWs = null
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a WebSocket connection.
 *
 * - In browser: creates a native WebSocket (constructor connects synchronously,
 *   onopen fires later). Returns immediately.
 * - In Tauri: uses the plugin's async connect(). The returned IWebSocket is
 *   already connected (readyState=OPEN) when the promise resolves, and onopen
 *   has already been called.
 *
 * Consumers should set onopen/onmessage/onclose/onerror BEFORE calling this,
 * or use the returned IWebSocket and set callbacks immediately after.
 *
 * For Tauri: callbacks set on the returned IWebSocket AFTER await will miss
 * the onopen event. To handle this, the factory accepts optional callbacks
 * that are wired BEFORE the connection attempt.
 */
export async function createWebSocket(
  url: string,
  callbacks?: {
    onopen?: (ev: Event) => void
    onmessage?: (ev: MessageEvent) => void
    onclose?: (ev: CloseEvent) => void
    onerror?: (ev: Event) => void
  },
): Promise<IWebSocket> {
  // console.log('[wsAdapter] createWebSocket called, isTauri:', isTauri, 'url:', url)
  if (isTauri) {
    const ws = new TauriWebSocket()
    // Wire callbacks BEFORE connecting so we don't miss onopen
    if (callbacks?.onopen) ws.onopen = callbacks.onopen
    if (callbacks?.onmessage) ws.onmessage = callbacks.onmessage
    if (callbacks?.onclose) ws.onclose = callbacks.onclose
    if (callbacks?.onerror) ws.onerror = callbacks.onerror
    await ws.init(url)
    return ws
  } else {
    const ws = new BrowserWebSocket(url)
    // Wire callbacks — onopen hasn't fired yet (browser WS is async internally)
    if (callbacks?.onopen) ws.onopen = callbacks.onopen
    if (callbacks?.onmessage) ws.onmessage = callbacks.onmessage
    if (callbacks?.onclose) ws.onclose = callbacks.onclose
    if (callbacks?.onerror) ws.onerror = callbacks.onerror
    return ws
  }
}
