// ============================================================================
// CHAT SESSION
// ============================================================================

export interface ChatSession {
  id: string
  cli_session_id?: string
  project_slug?: string
  cwd: string
  title?: string
  model: string
  created_at: string
  updated_at: string
  message_count: number
  total_cost_usd?: number
}

export interface CreateSessionRequest {
  message: string
  cwd?: string
  session_id?: string
  project_slug?: string
  model?: string
}

export interface CreateSessionResponse {
  session_id: string
  stream_url: string
}

// ============================================================================
// SSE EVENTS (discriminated union on `type`)
// ============================================================================

export type ChatEvent =
  | { type: 'assistant_text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool_call_id: string; tool_name: string; tool_input: Record<string, unknown> }
  | { type: 'tool_result'; tool_call_id: string; result: string; is_error?: boolean }
  | { type: 'permission_request'; tool_call_id: string; tool_name: string; tool_input: Record<string, unknown>; description: string }
  | { type: 'input_request'; request_id: string; prompt: string }
  | { type: 'result'; text: string; session_id: string; cost_usd?: number; duration_ms?: number }
  | { type: 'error'; message: string }

// ============================================================================
// CLIENT MESSAGES
// ============================================================================

export type ClientMessage =
  | { type: 'user_message'; text: string }
  | { type: 'permission_response'; tool_call_id: string; allowed: boolean }
  | { type: 'input_response'; request_id: string; response: string }

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

export interface ContentBlock {
  id: string
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'permission_request' | 'input_request' | 'error'
  content: string
  metadata?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  timestamp: Date
}

export type ChatPanelMode = 'closed' | 'open' | 'fullscreen'
