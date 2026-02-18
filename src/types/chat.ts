// ============================================================================
// PERMISSION CONFIG
// ============================================================================

/** Permission modes supported by Claude CLI via Nexus SDK */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

/** Runtime permission configuration (matches backend PermissionConfig struct) */
export interface PermissionConfig {
  /** Permission mode: controls how tool permissions are handled */
  mode: PermissionMode
  /** Tool patterns to explicitly allow (e.g. "Bash(git *)", "Read") */
  allowed_tools: string[]
  /** Tool patterns to explicitly disallow (e.g. "Bash(rm -rf *)") */
  disallowed_tools: string[]
  /** Default model from backend config (e.g. "claude-sonnet-4-5") */
  default_model?: string
}

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
  preview?: string
  /** Permission mode override for this session (undefined = global config default) */
  permission_mode?: PermissionMode
}

export interface CreateSessionRequest {
  message: string
  cwd: string
  session_id?: string
  project_slug?: string
  model?: string
  /** Permission mode override for this session (default: from server config) */
  permission_mode?: PermissionMode
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
// CHAT EVENTS (discriminated union on `type`)
// ============================================================================

export type ChatEvent =
  | { type: 'user_message'; content: string }
  | { type: 'assistant_text'; content: string }
  | { type: 'stream_delta'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: unknown; is_error?: boolean }
  | { type: 'tool_use_input_resolved'; id: string; input: Record<string, unknown> }
  | { type: 'tool_cancelled'; id: string; parent_tool_use_id?: string }
  | { type: 'permission_request'; id: string; tool: string; input: Record<string, unknown> }
  | { type: 'permission_decision'; id: string; allow: boolean }
  | { type: 'input_request'; prompt: string; options?: string[] }
  | { type: 'ask_user_question'; questions: AskUserQuestion[]; tool_call_id?: string; id?: string }
  | { type: 'result'; session_id: string; duration_ms: number; cost_usd?: number; subtype?: string; is_error?: boolean; num_turns?: number; result_text?: string }
  | { type: 'error'; message: string }
  | { type: 'partial_text'; content: string }
  | { type: 'streaming_status'; is_streaming: boolean }
  | { type: 'permission_mode_changed'; mode: string }
  | { type: 'model_changed'; model: string }
  | { type: 'compaction_started'; trigger: string }
  | { type: 'compact_boundary'; trigger: string; pre_tokens?: number }
  | { type: 'system_init'; cli_session_id: string; model?: string; tools?: string[]; mcp_servers?: { name: string; status?: string }[]; permission_mode?: string }
  | { type: 'auto_continue'; session_id: string; delay_ms: number }
  | { type: 'auto_continue_state_changed'; session_id: string; enabled: boolean }

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
  /** Raw chat events (ChatEvent + id/seq/created_at metadata) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[]
  total_count: number
  has_more: boolean
  offset: number
  limit: number
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

export interface MessageSearchHit {
  message_id: string
  role: 'user' | 'assistant'
  content_snippet: string
  turn_index: number
  created_at: number // Unix timestamp
  score: number
}

export interface MessageSearchResult {
  session_id: string
  session_title?: string
  session_preview?: string
  project_slug?: string
  conversation_id: string
  hits: MessageSearchHit[]
  best_score: number
}

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

export interface ContentBlock {
  id: string
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'permission_request' | 'input_request' | 'ask_user_question' | 'error' | 'compact_boundary' | 'model_changed' | 'result_max_turns' | 'result_error' | 'system_init' | 'continue_indicator'
  content: string
  metadata?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  timestamp: Date
  /** Total turn duration in ms (from backend result event) */
  duration_ms?: number
  /** Total turn cost in USD (from backend result event) */
  cost_usd?: number
}

export type ChatPanelMode = 'closed' | 'open' | 'fullscreen'

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/** Connection status for the chat WebSocket */
export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** Messages sent from the client to the server over WebSocket */
export type WsChatClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'interrupt' }
  | { type: 'permission_response'; id?: string; allow: boolean }
  | { type: 'input_response'; id?: string; content: string }
  | { type: 'set_permission_mode'; mode: string }
  | { type: 'set_model'; model: string }
  | { type: 'set_auto_continue'; enabled: boolean }

/** A chat event received over WebSocket with sequence number */
export interface ChatWsEvent {
  /** Sequence number (0 for non-persisted stream_delta) */
  seq: number
  /** Event type */
  type: string
  /** Event payload (varies by type) */
  [key: string]: unknown
  /** Whether this event is from the replay phase */
  replaying?: boolean
}
