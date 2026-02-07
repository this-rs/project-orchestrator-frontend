import { api, buildQuery } from './api'
import type {
  ChatSession,
  CreateSessionRequest,
  CreateSessionResponse,
  ClientMessage,
  ChatEvent,
  PaginatedResponse,
} from '@/types'

interface ListSessionsParams {
  limit?: number
  offset?: number
  project_slug?: string
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

  sendMessage: (sessionId: string, message: ClientMessage) =>
    api.post<{ status: string }>(`/chat/sessions/${sessionId}/messages`, message),

  interrupt: (sessionId: string) =>
    api.post<{ status: string }>(`/chat/sessions/${sessionId}/interrupt`),
}

export function subscribeToChatStream(
  sessionId: string,
  onEvent: (event: ChatEvent) => void,
  onError: (error: Event) => void,
): () => void {
  const url = `/api/chat/sessions/${sessionId}/stream`
  const eventSource = new EventSource(url)

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ChatEvent
      onEvent(data)
    } catch {
      // ignore malformed events
    }
  }

  eventSource.onerror = (error) => {
    onError(error)
    eventSource.close()
  }

  return () => {
    eventSource.close()
  }
}
