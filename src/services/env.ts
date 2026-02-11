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
 * Can be updated at runtime via setBackendPort() after Tauri invoke
 * or when the setup wizard changes the port.
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

/** The backend server origin. Empty string in dev (relative URLs via Vite proxy). */
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

/** Build a WebSocket URL for a given path (e.g. /ws/events). */
export function wsUrl(path: string): string {
  if (isTauri) {
    return `ws://localhost:${_backendPort}${path}`
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
