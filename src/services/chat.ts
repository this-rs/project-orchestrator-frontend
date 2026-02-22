import { api, buildQuery } from './api'
import type {
  ChatConfig,
  ChatSession,
  CliInstallResult,
  CliVersionStatus,
  CreateSessionRequest,
  CreateSessionResponse,
  DetectPathResponse,
  PaginatedResponse,
  MessageHistoryResponse,
  MessageSearchResult,
  PermissionConfig,
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

  // PATH detection
  detectPath: () =>
    api.get<DetectPathResponse>('/chat/detect-path'),

  // CLI version management
  getCliStatus: () =>
    api.get<CliVersionStatus>('/chat/cli/status'),

  installCli: (version?: string) =>
    api.post<CliInstallResult>('/chat/cli/install', { version: version ?? null }),
}
