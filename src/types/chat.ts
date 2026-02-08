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
  cwd: string
  session_id?: string
  project_slug?: string
  model?: string
}

export interface CreateSessionResponse {
  session_id: string
  stream_url: string
}

// ============================================================================
// ASK USER QUESTION
// ============================================================================

export interface AskUserQuestionOption {
  label: string
  description?: string
}

export interface AskUserQuestion {
  question: string
  header?: string
  multiSelect: boolean
  options: AskUserQuestionOption[]
}

// ============================================================================
// SSE EVENTS (discriminated union on `type`)
// ============================================================================

export type ChatEvent =
  | { type: 'assistant_text'; content: string }
  | { type: 'stream_delta'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: unknown; is_error?: boolean }
  | { type: 'permission_request'; id: string; tool: string; input: Record<string, unknown> }
  | { type: 'input_request'; prompt: string; options?: string[] }
  | { type: 'ask_user_question'; questions: AskUserQuestion[] }
  | { type: 'result'; session_id: string; duration_ms: number; cost_usd?: number }
  | { type: 'error'; message: string }

// ============================================================================
// CLIENT MESSAGES
// ============================================================================

export type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'permission_response'; tool_call_id: string; allowed: boolean }
  | { type: 'input_response'; content: string }

// ============================================================================
// MESSAGE HISTORY API RESPONSE
// ============================================================================

export interface MessageHistoryItem {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  turn_index: number
  created_at: number // Unix timestamp
}

export interface MessageHistoryResponse {
  messages: MessageHistoryItem[]
  total_count: number
  has_more: boolean
  offset: number
  limit: number
}

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

export interface ContentBlock {
  id: string
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'permission_request' | 'input_request' | 'ask_user_question' | 'error'
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
