import { getAuthMode } from './auth'
import { getValidToken, refreshToken, forceLogout } from './authManager'

const API_BASE = '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  // Build headers with fresh auth token injection
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }

  const token = await getValidToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
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
