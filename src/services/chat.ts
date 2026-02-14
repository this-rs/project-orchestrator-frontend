import { api, buildQuery } from './api'
import type {
  ChatSession,
  CreateSessionRequest,
  CreateSessionResponse,
  PaginatedResponse,
  MessageHistoryResponse,
  MessageSearchResult,
  PermissionConfig,
} from '@/types'

interface ListSessionsParams {
  limit?: number
  offset?: number
  project_slug?: string
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
}
