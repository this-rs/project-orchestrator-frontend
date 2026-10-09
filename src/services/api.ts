import { getAuthMode } from './auth'
import { getValidToken, refreshToken, forceLogout } from './authManager'
import { isTauri, getApiBase } from './env'
import { tr } from '@/i18n/lazy'

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
 * The server answered something that is not the JSON the client expects
 * (typically an HTML page: a proxy error, a static-file fallback, a login
 * portal). Carries a readable sentence that NAMES the request, instead of the
 * raw parser error (`JSON Parse error: Unrecognized token '<'`) or a page of HTML.
 */
export class NonJsonResponseError extends ApiError {
  constructor(
    status: number,
    public method: string,
    public path: string,
    public contentType: string | null,
  ) {
    super(status, nonJsonMessage(method, path, status, contentType))
    this.name = 'NonJsonResponseError'
  }
}

function nonJsonMessage(method: string, path: string, status: number, contentType: string | null): string {
  const type = contentType ? ` (${contentType.split(';')[0].trim()})` : ''
  return tr('app.api.nonJson', { request: `${method} ${path}`, status, type })
}

/** Path of the request, without origin or query (a query may carry identifiers). */
function requestPath(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname
  } catch {
    return url.split('?')[0]
  }
}

/** An HTML page (or anything that is clearly not JSON nor a short sentence). */
function looksLikeHtml(text: string, contentType: string | null): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true
  return /^\s*<(?:!doctype|html|head|body|\?xml)/i.test(text)
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
    // Bail out early if the request was aborted between retries
    if (init.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
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
  // Fast-path: bail immediately if already aborted (e.g. navigation happened
  // while a previous request was still being set up). This avoids queueing
  // a fetch that would just be cancelled, freeing up browser connection slots.
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

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

  // Re-check abort after async token retrieval (navigation may have
  // happened while waiting for a token refresh lock).
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  // Preserve any AbortSignal passed via options
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
          throw new ApiError(401, tr('app.api.sessionExpired'))
        }
      }

      // Already retried once → force logout
      forceLogout()
      throw new ApiError(401, tr('app.api.sessionExpired'))
    }

    const message = await response.text()
    const contentType = response.headers?.get?.('content-type') ?? null
    if (message && looksLikeHtml(message, contentType)) {
      // An HTML error page says nothing a person can act on: name the request instead.
      throw new NonJsonResponseError(response.status, (options.method ?? 'GET').toUpperCase(), requestPath(url), contentType)
    }
    throw new ApiError(response.status, message || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return {} as T
  }

  // Some endpoints return 201/200 with empty body — avoid JSON.parse("") SyntaxError
  const text = await response.text()
  if (!text) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new NonJsonResponseError(
      response.status,
      (options.method ?? 'GET').toUpperCase(),
      requestPath(url),
      response.headers?.get?.('content-type') ?? null,
    )
  }
}

export const api = {
  get: <T>(endpoint: string, signal?: AbortSignal) =>
    request<T>(endpoint, { signal }),

  post: <T>(endpoint: string, data?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    }),

  patch: <T>(endpoint: string, data: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
      signal,
    }),

  put: <T>(endpoint: string, data?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    }),

  delete: <T>(endpoint: string, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'DELETE', signal }),
}

/** Low-level request, for the rare call that needs extra headers. */
export const apiRequest = request

/**
 * The sentence to show a human. The API answers errors as `{"error": "..."}`
 * and `ApiError.message` carries that raw body — never put it in a toast as is.
 */
export function apiErrorMessage(err: unknown, fallback = tr('app.api.fallback')): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string }
      if (parsed.error) return parsed.error
    } catch {
      /* not JSON — the message is already plain text */
    }
    return err.message || fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
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
