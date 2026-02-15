/**
 * authManager — Centralized auth lifecycle manager.
 *
 * Module-level singleton that handles:
 * - forceLogout(): clean logout across all layers (memory, Jotai, WebSockets, navigation)
 * - refreshToken(): JWT refresh with concurrent-call deduplication (via HttpOnly cookie)
 * - getValidToken(): returns a fresh token, refreshing if near expiry
 * - initCrossTabSync(): uses BroadcastChannel API to sync logout across tabs
 *
 * This module is intentionally outside the React tree so it can be called from
 * anywhere (WebSocket handlers, API interceptors, etc.). React Router navigation
 * and Jotai atom setters are injected via setter functions at mount time.
 *
 * Token storage: in-memory only (module-level variable in auth.ts).
 * The HttpOnly cookie handles persistence across page reloads.
 */

import { getAuthMode, getAuthToken, setAuthToken, authApi } from './auth'
import { getEventBus } from './eventBus'

// ---------------------------------------------------------------------------
// Injectable dependencies (set from React tree at ProtectedRoute mount)
// ---------------------------------------------------------------------------

type NavigateFn = (path: string) => void
type JotaiSetters = {
  setToken: (token: string | null) => void
  setUser: (user: null) => void
}

let _navigate: NavigateFn | null = null
let _jotai: JotaiSetters | null = null

/** Inject React Router navigate (called from ProtectedRoute on mount) */
export function setNavigate(fn: NavigateFn): void {
  _navigate = fn
}

/** Inject Jotai atom setters (called from ProtectedRoute on mount) */
export function setJotaiSetter(setters: JotaiSetters): void {
  _jotai = setters
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Decode JWT payload and extract the `exp` field (seconds since epoch).
 * Returns null if the token is malformed or has no exp.
 * No external library — just atob + JSON.parse.
 */
export function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // base64url → base64
    let payload = parts[1]
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')

    // pad to multiple of 4
    const pad = payload.length % 4
    if (pad) payload += '='.repeat(4 - pad)

    const decoded = JSON.parse(atob(payload)) as { exp?: number }
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Token refresh with concurrent-call deduplication
// ---------------------------------------------------------------------------

let _isRefreshing = false
let _refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

/**
 * Refresh the JWT token via POST /auth/refresh.
 *
 * The refresh endpoint reads the HttpOnly cookie (credentials: 'include')
 * — no Bearer header needed. This works even when the access token is expired
 * or null (e.g. after page reload).
 *
 * - Deduplicates concurrent calls: only one network request is made,
 *   all callers receive the same result.
 * - On success: updates in-memory token cache and Jotai atom.
 * - On 401 from refresh endpoint: calls forceLogout() — no retry loop.
 */
export async function refreshToken(): Promise<string> {
  // If already refreshing, queue this caller
  if (_isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      _refreshQueue.push({ resolve, reject })
    })
  }

  _isRefreshing = true

  try {
    const resp = await authApi.refresh()
    const newToken = resp.token

    // Update in-memory token cache
    setAuthToken(newToken)

    // Sync Jotai atom
    _jotai?.setToken(newToken)

    // Resolve all queued callers
    for (const waiter of _refreshQueue) {
      waiter.resolve(newToken)
    }

    return newToken
  } catch (err: unknown) {
    // If refresh itself returned 401 → game over, force logout
    const status = (err as { status?: number }).status
    if (status === 401) {
      forceLogout()
    }

    // Reject all queued callers
    for (const waiter of _refreshQueue) {
      waiter.reject(err)
    }

    throw err
  } finally {
    _isRefreshing = false
    _refreshQueue = []
  }
}

// ---------------------------------------------------------------------------
// getValidToken — returns a fresh token, refreshing if near expiry
// ---------------------------------------------------------------------------

/** Threshold in seconds before expiry to trigger a proactive refresh */
const REFRESH_THRESHOLD_S = 30

/**
 * Get a valid auth token, refreshing proactively if it's about to expire.
 *
 * - In no-auth mode: returns null (no token needed).
 * - If token is missing: attempts a refresh via cookie (page reload case).
 * - If token expires within REFRESH_THRESHOLD_S: triggers refresh.
 * - If token is already expired: triggers refresh.
 * - Otherwise: returns the current token as-is.
 */
export async function getValidToken(): Promise<string | null> {
  if (getAuthMode() === 'none') return null

  const token = getAuthToken()
  if (!token) {
    // No token in memory — try refreshing via cookie (page reload scenario)
    try {
      return await refreshToken()
    } catch {
      return null
    }
  }

  const exp = parseJwtExp(token)
  if (exp === null) {
    // Cannot determine expiry → use token as-is (backend will reject if invalid)
    return token
  }

  const nowS = Math.floor(Date.now() / 1000)
  if (exp - nowS < REFRESH_THRESHOLD_S) {
    // Token expired or about to expire → refresh
    try {
      return await refreshToken()
    } catch {
      // Refresh failed — return null, let caller handle (forceLogout was already
      // called inside refreshToken if it was a 401)
      return null
    }
  }

  return token
}

// ---------------------------------------------------------------------------
// forceLogout — single source of truth for logout
// ---------------------------------------------------------------------------

/** Guard to prevent re-entrant logout calls */
let _isLoggingOut = false

/**
 * Force a full logout across all layers:
 * 1. Call POST /auth/logout to revoke the refresh cookie server-side
 * 2. Clear in-memory token
 * 3. Sync Jotai atoms (token=null, user=null)
 * 4. Broadcast logout to other tabs via BroadcastChannel
 * 5. Disconnect all WebSockets (EventBus + ChatWS via EventBus singleton)
 * 6. Navigate to /login (React Router if available, hard redirect as fallback)
 *
 * Safe to call from anywhere: React components, API interceptors, WebSocket handlers.
 * Re-entrant safe: calling forceLogout() while already logging out is a no-op.
 */
export function forceLogout(): void {
  if (_isLoggingOut) return
  _isLoggingOut = true

  try {
    // 1. Revoke refresh token server-side (best-effort, don't await)
    authApi.logout()

    // 2. Clear in-memory token
    setAuthToken(null)

    // 3. Sync Jotai state
    _jotai?.setToken(null)
    _jotai?.setUser(null)

    // 4. Broadcast logout to other tabs
    try {
      _authChannel?.postMessage({ type: 'logout' })
    } catch {
      // BroadcastChannel may not be available — ignore
    }

    // 5. Disconnect WebSockets
    try {
      getEventBus().disconnect()
    } catch {
      // EventBus may not be initialized yet — ignore
    }

    // 6. Navigate to login
    if (_navigate) {
      _navigate('/login')
    } else {
      window.location.href = '/login'
    }
  } finally {
    _isLoggingOut = false
  }
}

// ---------------------------------------------------------------------------
// Cross-tab sync — BroadcastChannel API (replaces StorageEvent)
// ---------------------------------------------------------------------------

let _authChannel: BroadcastChannel | null = null

/**
 * Start listening for auth events from other tabs via BroadcastChannel.
 *
 * Replaces the old StorageEvent-based sync (which relied on localStorage).
 * Since tokens are now in-memory only, we use BroadcastChannel to notify
 * other tabs when a logout occurs.
 *
 * - If another tab logs out → forceLogout() in this tab
 * - Token refresh doesn't need cross-tab sync: each tab has its own
 *   in-memory token, and all share the same HttpOnly cookie.
 *
 * Returns a cleanup function to stop listening (call in useEffect cleanup).
 */
export function initCrossTabSync(): () => void {
  try {
    _authChannel = new BroadcastChannel('auth')

    _authChannel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string }
      if (data?.type === 'logout') {
        // Another tab logged out → logout this tab too (skip re-broadcasting)
        _isLoggingOut = true
        try {
          setAuthToken(null)
          _jotai?.setToken(null)
          _jotai?.setUser(null)
          try {
            getEventBus().disconnect()
          } catch {
            // ignore
          }
          if (_navigate) {
            _navigate('/login')
          } else {
            window.location.href = '/login'
          }
        } finally {
          _isLoggingOut = false
        }
      }
    }

    return () => {
      _authChannel?.close()
      _authChannel = null
    }
  } catch {
    // BroadcastChannel not supported — no-op
    return () => {}
  }
}
