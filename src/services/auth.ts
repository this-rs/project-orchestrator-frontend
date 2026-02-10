/**
 * Auth API service — multi-provider auth (no-auth, password, OIDC) + JWT management.
 *
 * Auth endpoints are under /auth/* (public, no /api prefix).
 * The /auth/me and /auth/refresh routes require a valid Bearer token.
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

const AUTH_BASE = '/auth'

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

/** Get the stored token from localStorage */
export function getAuthToken(): string | null {
  try {
    // jotai atomWithStorage stores as JSON string (with quotes)
    const raw = localStorage.getItem('auth_token')
    if (!raw) return null
    return JSON.parse(raw) as string | null
  } catch {
    return null
  }
}

async function authRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${AUTH_BASE}${endpoint}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Add Bearer token for protected auth routes (/auth/me, /auth/refresh)
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
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

  /** GET /auth/oidc — Get OIDC authorization URL */
  getOidcAuthUrl: () =>
    authRequest<AuthUrlResponse>('/oidc'),

  /** POST /auth/oidc/callback — Exchange OIDC auth code for JWT + user */
  exchangeOidcCode: (code: string) =>
    authRequest<AuthTokenResponse>('/oidc/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // =========================================================================
  // Legacy Google endpoints (aliases — backward compatible)
  // =========================================================================

  /** @deprecated Use getOidcAuthUrl() instead */
  getGoogleAuthUrl: () =>
    authRequest<AuthUrlResponse>('/google'),

  /** @deprecated Use exchangeOidcCode() instead */
  exchangeCode: (code: string) =>
    authRequest<AuthTokenResponse>('/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // =========================================================================
  // Token management (protected routes)
  // =========================================================================

  /** GET /auth/me — Get current authenticated user */
  me: () =>
    authRequest<AuthUser>('/me'),

  /** POST /auth/refresh — Get a fresh JWT token */
  refresh: () =>
    authRequest<RefreshTokenResponse>('/refresh', {
      method: 'POST',
    }),
}
