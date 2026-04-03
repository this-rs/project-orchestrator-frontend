import { api, buildQuery } from './api'
import type {
  AgentExecution,
  ChatConfig,
  ChatSession,
  CliInstallResult,
  CliVersionStatus,
  CreateSessionRequest,
  CreateSessionResponse,
  DetachedSession,
  DetectPathResponse,
  PaginatedResponse,
  MessageHistoryResponse,
  MessageSearchResult,
  PermissionConfig,
  SessionInfo,
  SessionTreeNode,
} from '@/types'

interface ListSessionsParams {
  limit?: number
  offset?: number
  project_slug?: string
  /** Filter sessions by workspace */
  workspace_slug?: string
}

interface GetMessagesParams {
  limit?: number
  offset?: number
}

interface SearchMessagesParams {
  q: string
  project_slug?: string
  limit?: number
}

export const chatApi = {
  createSession: (data: CreateSessionRequest) =>
    api.post<CreateSessionResponse>('/chat/sessions', data),

  listSessions: (params: ListSessionsParams = {}) =>
    api.get<PaginatedResponse<ChatSession>>(`/chat/sessions${buildQuery(params)}`),

  getSession: (sessionId: string) =>
    api.get<ChatSession>(`/chat/sessions/${sessionId}`),

  deleteSession: (sessionId: string) =>
    api.delete(`/chat/sessions/${sessionId}`),

  renameSession: (sessionId: string, title: string) =>
    api.patch<ChatSession>(`/chat/sessions/${sessionId}`, { title }),

  getMessages: (sessionId: string, params: GetMessagesParams = {}) =>
    api.get<MessageHistoryResponse>(`/chat/sessions/${sessionId}/messages${buildQuery(params)}`),

  searchMessages: (params: SearchMessagesParams) =>
    api.get<MessageSearchResult[]>(`/chat/search${buildQuery(params)}`),

  // Permission config (runtime GET/PUT)
  getPermissionConfig: () =>
    api.get<PermissionConfig>('/chat/config/permissions'),

  updatePermissionConfig: (config: PermissionConfig) =>
    api.put<PermissionConfig>('/chat/config/permissions', config),

  // Full chat config (unified GET/PATCH — includes permissions + env config)
  getChatConfig: () =>
    api.get<ChatConfig>('/chat/config'),

  updateChatConfig: (patch: Partial<ChatConfig>) =>
    api.patch<ChatConfig>('/chat/config', patch),

  /** Get child sessions (detached) of a parent session, with streaming status */
  getSessionChildren: (sessionId: string) =>
    api.get<DetachedSession[]>(`/chat/sessions/${sessionId}/children`),

  /** Interrupt a running session (used to stop detached runs) */
  interruptSession: (sessionId: string) =>
    api.post(`/chat/sessions/${sessionId}/interrupt`, {}),

  // PATH detection
  detectPath: () =>
    api.get<DetectPathResponse>('/chat/detect-path'),

  // CLI version management
  getCliStatus: () =>
    api.get<CliVersionStatus>('/chat/cli/status'),

  installCli: (version?: string) =>
    api.post<CliInstallResult>('/chat/cli/install', { version: version ?? null }),

  /** Get the hierarchical session tree starting from a root session */
  getSessionTree: (sessionId: string) =>
    api.get<SessionTreeNode[]>(`/chat/sessions/${sessionId}/tree`),

  /** Get all sessions associated with a plan run */
  getRunSessions: (runId: string) =>
    api.get<SessionInfo[]>(`/chat/runs/${runId}/sessions`),

  /** Get agent execution records for a plan run */
  getAgentExecutions: (runId: string) =>
    api.get<AgentExecution[]>(`/runs/${runId}/agent-executions`),
}
