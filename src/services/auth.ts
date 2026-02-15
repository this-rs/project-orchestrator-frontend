/**
 * Auth API service — multi-provider auth (no-auth, password, OIDC) + JWT management.
 *
 * Auth endpoints are under /auth/* (public, no /api prefix).
 *
 * Cookie handling:
 * - All auth requests use `credentials: 'include'` so the browser sends
 *   the HttpOnly `refresh_token` cookie automatically.
 * - Login/register/OIDC responses set the cookie via Set-Cookie header.
 * - POST /auth/refresh reads the cookie (no Bearer needed) and returns
 *   a fresh access JWT in the body + a new cookie (rotation).
 * - POST /auth/logout revokes the cookie server-side.
 */

import type {
  AuthMode,
  AuthProvidersResponse,
  AuthTokenResponse,
  AuthUrlResponse,
  AuthUser,
  LoginRequest,
  RefreshTokenResponse,
  RegisterRequest,
} from '@/types'

import { isTauri, getAuthBase } from './env'

/**
 * Module-level auth mode cache.
 * Set by ProtectedRoute after fetching GET /auth/providers.
 * Read by api.ts to decide whether to redirect on 401.
 */
let _authMode: AuthMode = 'required'

/** Update the cached auth mode (called from ProtectedRoute) */
export function setAuthMode(mode: AuthMode): void {
  _authMode = mode
}

/** Get the current auth mode */
export function getAuthMode(): AuthMode {
  return _authMode
}

/**
 * Module-level in-memory token cache.
 * Set by authManager after login/refresh, read by api.ts for Bearer header.
 * NOT persisted — lost on page reload (refreshed via cookie on boot).
 */
let _memoryToken: string | null = null

/** Get the in-memory access token */
export function getAuthToken(): string | null {
  return _memoryToken
}

/** Set the in-memory access token (called by authManager on login/refresh) */
export function setAuthToken(token: string | null): void {
  _memoryToken = token
}

/**
 * Startup retry for auth requests (same logic as api.ts).
 * In Tauri desktop mode the backend may not be ready yet on cold start.
 */
const AUTH_STARTUP_RETRY_MAX = 4
const AUTH_STARTUP_RETRY_DELAYS = [300, 600, 1200, 2000]
let _authBackendReachable = !isTauri

async function authFetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  if (_authBackendReachable) return fetch(url, init)
  let lastError: unknown
  for (let attempt = 0; attempt <= AUTH_STARTUP_RETRY_MAX; attempt++) {
    try {
      const resp = await fetch(url, init)
      _authBackendReachable = true
      return resp
    } catch (err) {
      lastError = err
      if (!(err instanceof TypeError)) throw err
      if (attempt < AUTH_STARTUP_RETRY_MAX) {
        await new Promise((r) => setTimeout(r, AUTH_STARTUP_RETRY_DELAYS[attempt] ?? 2000))
      }
    }
  }
  throw lastError
}

async function authRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getAuthBase()}${endpoint}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add Bearer token for protected auth routes (/auth/me)
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await authFetchWithRetry(url, {
    ...options,
    credentials: 'include', // Send HttpOnly refresh_token cookie
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    const err = new Error(message || `HTTP ${response.status}`)
    // Expose status so callers can distinguish 401 from other errors
    ;(err as Error & { status: number }).status = response.status
    throw err
  }

  return response.json()
}

export const authApi = {
  // =========================================================================
  // Provider discovery
  // =========================================================================

  /** GET /auth/providers — Discover available auth modes and providers */
  getProviders: () =>
    authRequest<AuthProvidersResponse>('/providers'),

  // =========================================================================
  // Password auth
  // =========================================================================

  /** POST /auth/login — Authenticate with email + password */
  loginWithPassword: (email: string, password: string) =>
    authRequest<AuthTokenResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password } satisfies LoginRequest),
    }),

  /** POST /auth/register — Create a new account (when registration is enabled) */
  register: (email: string, password: string, name: string) =>
    authRequest<AuthTokenResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name } satisfies RegisterRequest),
    }),

  // =========================================================================
  // OIDC (generic — Google, Microsoft, Okta, etc.)
  // =========================================================================

  /** GET /auth/oidc — Get OIDC authorization URL (sends current origin for dynamic redirect_uri) */
  getOidcAuthUrl: () => {
    const origin = encodeURIComponent(window.location.origin)
    return authRequest<AuthUrlResponse>(`/oidc?origin=${origin}`)
  },

  /** POST /auth/oidc/callback — Exchange OIDC auth code for JWT + user (sends origin for redirect_uri matching) */
  exchangeOidcCode: (code: string) =>
    authRequest<AuthTokenResponse>('/oidc/callback', {
      method: 'POST',
      body: JSON.stringify({ code, origin: window.location.origin }),
    }),

  // =========================================================================
  // Legacy Google endpoints (aliases — backward compatible)
  // =========================================================================

  /** @deprecated Use getOidcAuthUrl() instead */
  getGoogleAuthUrl: () => {
    const origin = encodeURIComponent(window.location.origin)
    return authRequest<AuthUrlResponse>(`/google?origin=${origin}`)
  },

  /** @deprecated Use exchangeOidcCode() instead */
  exchangeCode: (code: string) =>
    authRequest<AuthTokenResponse>('/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code, origin: window.location.origin }),
    }),

  // =========================================================================
  // Token management
  // =========================================================================

  /** GET /auth/me — Get current authenticated user (requires Bearer) */
  me: () =>
    authRequest<AuthUser>('/me'),

  /** POST /auth/refresh — Get a fresh JWT token (uses cookie, no Bearer needed) */
  refresh: () =>
    authRequest<RefreshTokenResponse>('/refresh', {
      method: 'POST',
    }),

  /** POST /auth/logout — Revoke refresh token and clear cookie */
  logout: () =>
    authRequest<void>('/logout', {
      method: 'POST',
    }).catch(() => {
      // Best-effort — logout should not fail the UI flow
    }),
}
