import { apiAuth, apiErrorMessage } from './api'

// ── Types ────────────────────────────────────────────────────────────────

export interface McpToken {
  jti: string
  user_id: string
  label: string
  scope: string
  expires_at: string
  created_at: string
  revoked: boolean
}

export interface CreateMcpTokenRequest {
  label: string
  expiry_days?: number
  scope?: string
}

export interface CreateMcpTokenResponse {
  token: string
  jti: string
  label: string
  scope: string
  expires_at: string
}

export interface PurgeResponse {
  purged: number
}

// ── API ──────────────────────────────────────────────────────────────────

export const mcpTokensApi = {
  list: (signal?: AbortSignal) => apiAuth.get<McpToken[]>('/mcp-tokens', signal),

  create: (req: CreateMcpTokenRequest, signal?: AbortSignal) =>
    apiAuth.post<CreateMcpTokenResponse>('/mcp-tokens', req, signal),

  revoke: (jti: string, signal?: AbortSignal) =>
    apiAuth.delete<void>(`/mcp-tokens/${encodeURIComponent(jti)}`, signal),

  purge: (signal?: AbortSignal) => apiAuth.delete<PurgeResponse>('/mcp-tokens', signal),
}

export { apiErrorMessage as mcpTokensErrorMessage }
