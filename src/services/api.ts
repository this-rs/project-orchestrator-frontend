import { getAuthMode } from './auth'
import { getValidToken, refreshToken, forceLogout } from './authManager'
import { isTauri, getApiBase } from './env'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Startup retry configuration.
 *
 * In Tauri desktop mode the backend server starts in parallel with the frontend.
 * During the first few seconds, fetch() may fail with a network error (connection
 * refused) before the server is fully ready. We retry transparently so pages
 * don't flash a "Failed to load" error on cold start.
 */
const STARTUP_RETRY_MAX = 4
const STARTUP_RETRY_DELAYS = [300, 600, 1200, 2000] // exponential-ish backoff

/** Track whether we've successfully talked to the backend at least once. */
let _backendReachable = !isTauri // In web mode, assume reachable (Vite proxy)

async function fetchWithStartupRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  // If backend is already known to be reachable, do a single attempt
  if (_backendReachable) {
    return fetch(url, init)
  }

  // Startup phase — retry on network errors (TypeError from fetch = connection refused)
  let lastError: unknown
  for (let attempt = 0; attempt <= STARTUP_RETRY_MAX; attempt++) {
    try {
      const resp = await fetch(url, init)
      _backendReachable = true
      return resp
    } catch (err) {
      lastError = err
      // Only retry on network errors (TypeError), not on AbortError etc.
      if (!(err instanceof TypeError)) throw err
      if (attempt < STARTUP_RETRY_MAX) {
        const delay = STARTUP_RETRY_DELAYS[attempt] ?? 2000
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const url = `${getApiBase()}${endpoint}`

  // Build headers with fresh auth token injection
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }

  const token = await getValidToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetchWithStartupRetry(url, {
    ...options,
    credentials: 'include', // Send HttpOnly refresh_token cookie
    headers,
  })

  if (!response.ok) {
    // 401 Unauthorized in auth-required mode → try refresh once, then logout
    if (response.status === 401 && getAuthMode() === 'required') {
      if (!_isRetry) {
        try {
          // Attempt token refresh and retry the original request once
          await refreshToken()
          return request<T>(endpoint, options, true)
        } catch {
          // Refresh failed (forceLogout already called inside refreshToken on 401)
          throw new ApiError(401, 'Session expired')
        }
      }

      // Already retried once → force logout
      forceLogout()
      throw new ApiError(401, 'Session expired')
    }

    const message = await response.text()
    throw new ApiError(response.status, message || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
}

// Query string builder
export function buildQuery(params: object): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}
