/**
 * Auth API service — Google OAuth + JWT token management.
 *
 * Auth endpoints are under /auth/* (public, no /api prefix).
 * The /auth/me and /auth/refresh routes require a valid Bearer token.
 */

import type { AuthTokenResponse, AuthUrlResponse, AuthUser, RefreshTokenResponse } from '@/types'

const AUTH_BASE = '/auth'

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
    throw new Error(message || `HTTP ${response.status}`)
  }

  return response.json()
}

export const authApi = {
  /** GET /auth/google — Get Google OAuth authorization URL */
  getGoogleAuthUrl: () =>
    authRequest<AuthUrlResponse>('/google'),

  /** POST /auth/google/callback — Exchange auth code for JWT + user */
  exchangeCode: (code: string) =>
    authRequest<AuthTokenResponse>('/google/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  /** GET /auth/me — Get current authenticated user */
  me: () =>
    authRequest<AuthUser>('/me'),

  /** POST /auth/refresh — Get a fresh JWT token */
  refresh: () =>
    authRequest<RefreshTokenResponse>('/refresh', {
      method: 'POST',
    }),
}
