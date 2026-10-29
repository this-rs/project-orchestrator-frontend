import { getAuthMode } from './auth'
import { getValidToken, refreshToken, forceLogout } from './authManager'
import { isTauri, getApiBase, getAuthBase } from './env'
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

/** Which backend prefix an endpoint lives under: `/api` (the default) or `/auth` (account routes). */
type RequestBase = 'api' | 'auth'

/**
 * Absolute URL of an endpoint. One function so that a message about a request
 * names the same path whichever stage failed to read it — the auth layer and
 * the JSON layer both report it.
 */
function endpointUrl(endpoint: string, base: RequestBase): string {
  return `${base === 'auth' ? getAuthBase() : getApiBase()}${endpoint}`
}

/**
 * One authenticated round-trip — and the ONLY place a bearer token is attached.
 *
 * Extracted out of [`request`] so that the two ways of reading an answer, JSON
 * and raw bytes, cannot drift apart. A second copy of the token path would be
 * a second thing to keep in step with `getAuthMode`, the startup retry, and
 * the refresh-once rule below; the day one of them changed, half the app would
 * authenticate differently from the other half.
 *
 * Resolves only with an `ok` response: every failure has already become an
 * `ApiError` (or a logout) by then.
 */
async function authedFetch(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
  base: RequestBase = 'api',
): Promise<Response> {
  // Fast-path: bail immediately if already aborted (e.g. navigation happened
  // while a previous request was still being set up). This avoids queueing
  // a fetch that would just be cancelled, freeing up browser connection slots.
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const url = endpointUrl(endpoint, base)

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
          return authedFetch(endpoint, options, true, base)
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

  return response
}

/**
 * JSON request on top of [`authedFetch`].
 *
 * All the auth, retry and error translation lives above; what is left here is
 * the one thing that is specific to JSON: an empty body is not a parse error.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
  base: RequestBase = 'api',
): Promise<T> {
  const response = await authedFetch(endpoint, options, _isRetry, base)

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
      requestPath(endpointUrl(endpoint, base)),
      response.headers?.get?.('content-type') ?? null,
    )
  }
}

/**
 * Binary request: the same authentication as [`request`], without a JSON parse.
 *
 * Needed because a protected file cannot be shown with `<img src>`: the tag
 * sends cookies but no `Authorization` header, so the only documents it could
 * display are those the cookie session happens to authorise. Reading the bytes
 * into a Blob first and handing the `<img>` an object URL keeps the bearer
 * token — and therefore every non-cookie deployment — working.
 */
async function requestBlob(
  endpoint: string,
  options: RequestInit = {},
  base: RequestBase = 'api',
): Promise<Blob> {
  const response = await authedFetch(endpoint, options, false, base)
  return response.blob()
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

  /**
   * Read a protected file's bytes. See [`requestBlob`] for why this exists
   * rather than a plain `<img src>`.
   */
  blob: (endpoint: string, signal?: AbortSignal) =>
    requestBlob(endpoint, { signal }),
}

/**
 * The same client on the `/auth` base, for the account routes that live outside `/api`
 * (MCP tokens): same Bearer injection, same refresh-on-401, same empty-body handling.
 */
export const apiAuth = {
  get: <T>(endpoint: string, signal?: AbortSignal) => request<T>(endpoint, { signal }, false, 'auth'),

  post: <T>(endpoint: string, data?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined, signal }, false, 'auth'),

  delete: <T>(endpoint: string, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'DELETE', signal }, false, 'auth'),
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
