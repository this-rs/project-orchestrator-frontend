/**
 * Environment detection and base URL configuration.
 *
 * In development (Vite dev server), all requests use relative paths and are
 * proxied to http://localhost:8080 by Vite.
 *
 * In Tauri production builds, the frontend is served from tauri:// protocol,
 * so we must use absolute URLs pointing to the embedded backend server.
 * The desktop app defaults to port 6600 to avoid conflicts with dev (8080/3002).
 */

/** True when running inside a Tauri webview (production build). */
export const isTauri: boolean = !!(
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
)

/** Default desktop backend port — must match setup::DEFAULT_DESKTOP_PORT in Rust. */
const DEFAULT_DESKTOP_PORT = 6600

/**
 * Mutable backend port — starts at DEFAULT_DESKTOP_PORT.
 * Updated at startup via initBackendPort() which invokes the Tauri command
 * `get_server_port` to read the actual port from config.yaml.
 */
let _backendPort = DEFAULT_DESKTOP_PORT

/** Update the backend port (called after Tauri invoke or setup wizard). */
export function setBackendPort(port: number): void {
  _backendPort = port
}

/** Get the current backend port. */
export function getBackendPort(): number {
  return _backendPort
}

/**
 * Initialize the backend port from the Tauri desktop app config.
 *
 * In Tauri mode, calls `get_server_port` to read the real port from config.yaml
 * (which may differ from the default 6600 if the user changed it in the setup wizard).
 * In browser mode this is a no-op.
 *
 * **Must be called before rendering** to ensure all API/WS URLs use the correct port.
 */
export async function initBackendPort(): Promise<void> {
  if (!isTauri) return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const port = await invoke<number>('get_server_port')
    if (port && port !== _backendPort) {
      // console.log(`[env] Backend port from config: ${port} (was ${_backendPort})`)
      _backendPort = port
    }
  } catch (e) {
    console.warn('[env] Failed to get server port from Tauri, using default:', e)
  }
}

/**
 * The backend server origin. Empty string in dev (relative URLs via Vite proxy).
 *
 * In Tauri mode we use `localhost` (not `127.0.0.1`) because HttpOnly cookies
 * set by `http://localhost:{port}/auth/callback` (OIDC flow) are scoped to the
 * `localhost` hostname. Using `127.0.0.1` would cause a cookie domain mismatch
 * and break auth refresh. WKWebView's NSURLSession handles IPv6 fallback
 * correctly for HTTP fetch, so there's no IPv6 issue here — only the
 * `tauri-plugin-websocket` (tungstenite) needs `127.0.0.1` (see `wsUrl`).
 */
function backendOrigin(): string {
  return isTauri ? `http://localhost:${_backendPort}` : ''
}

/** Base URL for REST API endpoints (/api/...). */
export function getApiBase(): string {
  return `${backendOrigin()}/api`
}

/** Base URL for auth endpoints (/auth/...). */
export function getAuthBase(): string {
  return `${backendOrigin()}/auth`
}

/**
 * Build a WebSocket URL for a given path (e.g. /ws/events).
 *
 * In Tauri mode we use `127.0.0.1` instead of `localhost` because
 * `tauri-plugin-websocket` (tungstenite) resolves `localhost` via DNS
 * which may return `::1` (IPv6) first on macOS. Since the backend
 * listens on `0.0.0.0` (IPv4-only), the IPv6 connection attempt fails.
 * Using `127.0.0.1` forces IPv4 without DNS resolution.
 */
export function wsUrl(path: string): string {
  if (isTauri) {
    return `ws://127.0.0.1:${_backendPort}${path}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/**
 * Check whether the backend has been configured (setup wizard completed).
 * Calls GET /api/setup-status — a public, no-auth endpoint.
 * Returns `true` if configured, `false` if the setup wizard should be shown.
 * On network error (backend not ready yet), retries a few times in Tauri mode
 * before returning `null`.
 */
export async function fetchSetupStatus(): Promise<boolean | null> {
  const maxAttempts = isTauri ? 8 : 1
  const delays = [200, 400, 600, 800, 1000, 1500, 2000, 3000]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(`${getApiBase()}/setup-status`)
      if (!resp.ok) return null
      const data: { configured: boolean } = await resp.json()
      return data.configured
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delays[attempt] ?? 2000))
      }
    }
  }
  return null
}
