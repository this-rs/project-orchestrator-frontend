import { api, buildQuery } from './api'
import type {
  AgentExecution,
  CancelToolsResult,
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
  SessionWithLinks,
} from '@/types'

interface ListSessionsParams {
  limit?: number
  offset?: number
  project_slug?: string
  /** Filter sessions by workspace */
  workspace_slug?: string
  /** Filter sessions linked to a specific plan */
  plan_id?: string
  /** Filter sessions linked to a specific task */
  task_id?: string
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

  /**
   * Cancel the currently-running tool subprocess(es) of a session WITHOUT
   * ending the LLM turn (plan 28e9afe3). Sends SIGINT to descendants only;
   * the agent receives a tool_result with `is_error:true` and continues.
   *
   * Distinct from `interruptSession` which terminates the entire turn.
   *
   * Returns 200 with `CancelToolsResult { cli_pid, killed_pids, capped }`.
   * `capped:true` means the per-session rate limit (10/60s) was hit; the
   * caller should display a "slow down" toast and retry later.
   */
  cancelTools: (sessionId: string) =>
    api.post<CancelToolsResult>(`/chat/sessions/${sessionId}/cancel-tools`, {}),

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

  // ── Chat ↔ Plan/Task/RFC Linking ──

  /** Get all chat sessions linked to a plan (runner + manual + transitive) */
  getPlanSessions: (planId: string) =>
    api.get<SessionWithLinks[]>(`/plans/${planId}/sessions`),

  /** Get all chat sessions linked to a task */
  getTaskSessions: (taskId: string) =>
    api.get<SessionWithLinks[]>(`/tasks/${taskId}/sessions`),

  /** Create an ASSOCIATED_WITH relation between a session and a Plan or Task */
  associateSession: (sessionId: string, entityType: 'Plan' | 'Task', entityId: string, source: string = 'manual') =>
    api.post(`/chat/sessions/${sessionId}/associate`, { entity_type: entityType, entity_id: entityId, source }),
}
