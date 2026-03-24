import { api } from './api'

// ── Types ────────────────────────────────────────────────────────────────

export type McpTransportType = 'stdio' | 'sse' | 'streamable_http'

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'reconnecting'

export type CircuitState = 'closed' | 'open' | 'half_open'

export type InferredCategory = 'query' | 'mutation' | 'search' | 'create' | 'delete' | 'unknown'

export type ResponseShape = 'object' | 'array' | 'scalar' | 'error' | 'not_probed'

export interface ServerStats {
  call_count: number
  error_count: number
  latency_p50: number | null
  latency_p95: number | null
  error_rate: number
  last_call_at: string | null
  last_error: string | null
}

export interface McpServerSummary {
  id: string
  display_name: string | null
  status: ConnectionStatus
  transport_type: McpTransportType
  tool_count: number
  connected_at: string | null
  stats: ServerStats
  circuit_breaker_state: CircuitState
  server_name: string | null
}

export interface ToolProfile {
  latency_ms: number
  response_shape: ResponseShape
  pagination: boolean
  error_format: string | null
  probed_at: string
}

export interface McpDiscoveredTool {
  name: string
  fqn: string
  description: string | null
  input_schema: Record<string, unknown>
  category: InferredCategory
  similar_internal: Array<[string, number]>
  profile: ToolProfile | null
}

export interface ConnectServerRequest {
  server_id: string
  display_name?: string
  transport: McpTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface ActionResponse {
  success: boolean
  server_id: string
  message: string
}

export interface ServerDetailResponse {
  server: McpServerSummary
}

export interface ServerToolsResponse {
  server_id: string
  tools: McpDiscoveredTool[]
}

// ── API ──────────────────────────────────────────────────────────────────

export const mcpFederationApi = {
  /** List all connected MCP servers */
  listServers: () =>
    api.get<McpServerSummary[]>('/mcp-federation/servers'),

  /** Connect a new MCP server */
  connectServer: (body: ConnectServerRequest) =>
    api.post<ActionResponse>('/mcp-federation/servers', body),

  /** Get status/details for a specific server */
  getServerStatus: (serverId: string) =>
    api.get<ServerDetailResponse>(`/mcp-federation/servers/${serverId}`),

  /** Disconnect (remove) a server */
  disconnectServer: (serverId: string) =>
    api.delete<ActionResponse>(`/mcp-federation/servers/${serverId}`),

  /** List tools discovered on a server */
  listServerTools: (serverId: string) =>
    api.get<ServerToolsResponse>(`/mcp-federation/servers/${serverId}/tools`),

  /** Trigger a probe on a server (re-discover tools) */
  probeServer: (serverId: string) =>
    api.post<ActionResponse>(`/mcp-federation/servers/${serverId}/probe`),

  /** Reconnect a disconnected/errored server */
  reconnectServer: (serverId: string) =>
    api.post<ActionResponse>(`/mcp-federation/servers/${serverId}/reconnect`),
}
