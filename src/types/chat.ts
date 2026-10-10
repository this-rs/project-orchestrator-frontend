import type { MessageAttachment } from '@/utils/messageAttachments'
import type { ChatReference, EntityRef, RefsResolvedEvent } from '@/refs/types'
import type { CostBasis, LegacyPermissionMode, ProviderCapabilities, ProviderId, ProviderKind, RoutedBy, ToolCategory, ToolPolicy, ToolPolicyMode } from './provider'
import type { ProviderRoutingMode } from './routing'
// ============================================================================
// PERMISSION CONFIG
// ============================================================================

/**
 * A permission mode AS RECEIVED from the backend (config, session record,
 * events): a legacy Claude CLI string or a neutral `ToolPolicyMode`.
 *
 * It is a wire type. The interface holds a `ToolPolicyMode` (read with
 * `readToolPolicyMode`) and writes with `toWireMode` — see `constants/toolPolicy.ts`.
 */
export type PermissionMode = LegacyPermissionMode | ToolPolicyMode

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

/** Full chat configuration (matches backend ChatConfigResponse) */
export interface ChatConfig {
  /** Permission mode */
  mode: PermissionMode
  /** Tool patterns to explicitly allow */
  allowed_tools: string[]
  /** Tool patterns to explicitly disallow */
  disallowed_tools: string[]
  /** Default model from backend config */
  default_model: string
  /** Process PATH for Claude CLI subprocess (null = inherited from system) */
  process_path: string | null
  /** Explicit Claude CLI binary path (null = auto-detected) */
  claude_cli_path: string | null
  /** Whether to auto-update CLI on startup */
  auto_update_cli: boolean
  /** Whether to auto-update the Tauri application on startup */
  auto_update_app: boolean
}

/** Response from GET /api/chat/detect-path */
export interface DetectPathResponse {
  path: string | null
  error?: string
}

/** CLI version status from GET /api/chat/cli/status */
export interface CliVersionStatus {
  installed: boolean
  installed_version: string | null
  latest_version: string | null
  update_available: boolean
  is_local_build: boolean
  cli_path: string | null
}

/** CLI install result from POST /api/chat/cli/install */
export interface CliInstallResult {
  success: boolean
  version: string | null
  message: string
  cli_path: string | null
}

// ============================================================================
// CHAT SESSION
// ============================================================================

// ============================================================================
// SPAWNED BY (detached sessions)
// ============================================================================

/** Origin of a detached session — runner, conversation, pipeline, gate, or trigger */
export type SpawnedBy =
  | { type: 'runner'; run_id: string; plan_id: string }
  | { type: 'conversation'; parent_session_id: string }
  | { type: 'pipeline'; run_id: string; plan_id: string; wave: number; task_id?: string }
  | { type: 'gate'; run_id: string; gate_type: string; retry_count: number }
  | { type: 'trigger'; trigger_id: string; event_type: string }

// ============================================================================
// PIPELINE GATE RESULTS
// ============================================================================

/** Status of a quality gate check */
export type GateStatus = 'Pass' | 'Fail' | 'Skip' | 'Error'

/** Result of a quality gate check (matches backend GateResult) */
export interface GateResult {
  gate_name: string
  status: GateStatus
  metrics: Record<string, number>
  message: string
  duration_ms: number
}

/** Response from GET /api/runs/{run_id}/gates */
export interface GateResultsResponse {
  run_id: string
  gates: GateResult[]
}

// ============================================================================
// PIPELINE PROGRESS SCORE
// ============================================================================

/** Per-dimension breakdown of progress score */
export interface ScoreDimensions {
  build: number
  tests: number
  coverage: number
  steps: number
}

/** Trend direction derived from recent deltas */
export type ProgressTrend = 'Improving' | 'Stable' | 'Regressing' | 'Stagnant' | 'Unknown'

/** Response from GET /api/runs/{run_id}/progress */
export interface ProgressScoreResponse {
  run_id: string
  score: number
  delta: number | null
  dimensions: ScoreDimensions
  trend: ProgressTrend
  total_checkpoints: number
  best_score: number
  worst_score: number
}

/** A child session with its streaming status */
export interface DetachedSession {
  id: string
  title?: string
  model: string
  created_at: string
  updated_at: string
  total_cost_usd?: number
  /** Where the cost figure comes from. Absent = `reported` (Claude Code). */
  cost_basis?: CostBasis | null
  /** Provider instance of the child. Absent = `claude-code`. */
  provider_id?: ProviderId | null
  spawned_by: SpawnedBy
  is_streaming: boolean
}

// ============================================================================
// CHAT ↔ PLAN/TASK/RFC LINKING
// ============================================================================

/** A plan linked to a chat session (via ASSOCIATED_WITH or AgentExecution) */
export interface ChatLinkedPlan {
  id: string
  title: string
  /** How the link was established: "runner" (via AgentExecution) or "manual" (via ASSOCIATED_WITH) */
  source: string
}

/** A task linked to a chat session */
export interface ChatLinkedTask {
  id: string
  title: string
  source: string
}

/** An RFC (note) transitively linked via plans */
export interface ChatLinkedRfc {
  id: string
  title: string
}

/** A session returned by plan/task session endpoints, with full link info */
export interface SessionWithLinks {
  session: {
    id: string
    cli_session_id?: string
    project_slug?: string
    workspace_slug?: string
    cwd: string
    title?: string
    model: string
    created_at: string
    updated_at: string
    message_count: number
    total_cost_usd?: number
    /** Where the cost figure comes from. Absent = `reported` (Claude Code). */
    cost_basis?: CostBasis | null
    preview?: string
  }
  links: {
    linked_plans: ChatLinkedPlan[]
    linked_tasks: ChatLinkedTask[]
    linked_rfcs: ChatLinkedRfc[]
  }
  /** How this session was found: "runner", "manual", "transitive" */
  source: string
}

/**
 * What a conversation is doing *right now*, as the backend reads it from the
 * live ChatManager (`GET /api/chat/live-activity`, and stamped on every
 * session the session endpoints return).
 *
 * Never persisted server-side: `is_streaming` lives in an AtomicBool in the
 * running process and is written nowhere else. So this is the only source
 * that can answer "is this conversation working?" — in particular it is the
 * only one that still answers correctly after a page reload, when no CRUD
 * event has arrived yet.
 */
export interface SessionActivity {
  /** The Claude CLI subprocess for this session is alive. */
  live: boolean
  /** A turn is being streamed right now. */
  streaming: boolean
  /** Permission requests waiting for a human answer (blocked on the user). */
  pending_permissions: number
  /** Active `Monitor` subprocesses — a "watch". */
  monitors: number
  /** Active `Bash run_in_background` subprocesses. */
  bash_tasks: number
}

/** Activity is absent for a quiet session; this is that answer, spelled out. */
export const QUIET_ACTIVITY: SessionActivity = {
  live: false,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
}

/** Body of `GET /api/chat/live-activity`. */
export interface LiveActivityResponse {
  generated_at: string
  /** Keyed by session id. An absent session is quiet, not unknown. */
  sessions: Record<string, SessionActivity>
}

export interface ChatSession {
  id: string
  cli_session_id?: string
  project_slug?: string
  /** Workspace slug if session spans a workspace */
  workspace_slug?: string
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
  /**
   * Provider INSTANCE the session runs on. Absent on a session created before
   * providers existed: read it as `claude-code` (see `sessionProviderId`).
   */
  provider_id?: ProviderId | null
  /** Kind of that instance, when the server stamps it. */
  provider_kind?: ProviderKind | null
  /** Capabilities frozen on the session when it opened. Absent = read them from the provider list. */
  capabilities?: Partial<ProviderCapabilities> | null
  /** Engine of the session (`agent`; absent = legacy). Same name as on `system_init`; NOT yet in the contract's ChatSession DTO. */
  engine?: string | null
  /** Features the engine cannot provide (same name as on `system_init`; NOT yet in the contract's ChatSession DTO). */
  degraded_features?: string[] | null
  /** Which rule picked the provider/model (`request`, `project_rule`, `auto`, …). */
  routed_by?: RoutedBy | null
  /** Routing mode in force when the session opened (`primary` when absent). */
  routing_mode?: ProviderRoutingMode | null
  /** The models ticked for THIS conversation (mixed: PO routes among them; strict: the one). */
  routing_pool?: { provider: ProviderId; model: string }[] | null
  /** Readable reason of an automatic choice (`routed_by: 'auto'`); `null` otherwise. */
  route_reason?: string | null
  /** Where the session's cost figure comes from. Absent = `reported` (Claude Code). */
  cost_basis?: CostBasis | null
  /** Additional directories exposed to Claude CLI (--add-dir) */
  add_dirs?: string[]
  /** Origin of this session if detached (null = normal conversation) */
  spawned_by?: SpawnedBy | null
  /** Plans linked to this session (via ASSOCIATED_WITH or AgentExecution) */
  linked_plans?: ChatLinkedPlan[]
  /** Tasks linked to this session */
  linked_tasks?: ChatLinkedTask[]
  /** RFCs transitively linked via plans */
  linked_rfcs?: ChatLinkedRfc[]
  /**
   * Live activity, stamped by the server from its in-memory map. Absent
   * means quiet — the server omits the field rather than sending zeroes.
   */
  activity?: SessionActivity
}

export interface CreateSessionRequest {
  message: string
  cwd: string
  session_id?: string
  project_slug?: string
  /** Workspace slug — resolves all project root_paths as --add-dir */
  workspace_slug?: string
  model?: string
  /**
   * Provider instance to open the session on. Omitted = the server resolves
   * the default (and a pre-provider backend ignores the field).
   */
  provider?: ProviderId
  /**
   * Routing mode of THIS conversation (`primary` / `mixed` / `full`), replacing the
   * settings' one for it alone. Omitted = the settings decide.
   */
  routing_mode?: ProviderRoutingMode
  /**
   * `mixed` only: the (provider, model) pairs PO may route this conversation among.
   * Omitted = no restriction beyond the mode.
   */
  routing_pool?: { provider: ProviderId; model: string }[]
  /**
   * Permission mode override for this session (default: from server config).
   * Legacy string, or a neutral `ToolPolicyMode` once the backend accepts both.
   */
  permission_mode?: PermissionMode
  /** Additional directories to expose to Claude CLI (--add-dir) */
  add_dirs?: string[]
  /**
   * Document ids to attach to the first message (plan 8b0fdd73's API
   * contract). Ids come from `POST /api/documents`, so they always exist
   * server-side by the time this request is built.
   */
  attachments?: string[]
  /**
   * References (`#kind:id`) of the first message. Omitted when empty, and
   * never sent unless the server announced `refs_v1`: an older server would
   * ignore the field and the model would get the bare token.
   */
  refs?: EntityRef[]
}

export interface CreateSessionResponse {
  session_id: string
  stream_url: string
  /**
   * `neutral` when the host made an empty working directory (no `cwd` sent); absent = `project`.
   * Typed, deliberately ignored: this interface always sends a `cwd`.
   */
  execution_place?: 'project' | 'neutral'
  /** Things the caller should know about how the session opened. Typed, not shown yet. */
  notices?: string[]
}

/** Body of `POST /api/chat/sessions/{id}/switch-provider` (human only: an agent token gets 403). */
export interface SwitchProviderRequest {
  /** Provider instance the conversation moves to. */
  provider: ProviderId
  /** Model on that provider; absent = the instance's default. */
  model?: string
  /** The next message: required, sent on the new provider after the relayed history. */
  message: string
}

/**
 * What `POST /api/chat/sessions/{id}/switch-provider` answers: the conversation now
 * runs in `session_id`, `previous_session_id` is closed.
 */
export interface SwitchProviderResponse {
  session_id: string
  stream_url: string
  previous_session_id: string
  /** Earlier entries replayed (as text) to the new provider. */
  relayed_entries: number
  /** Oldest entries left out to fit the target's context window (stated to the model). */
  omitted_entries: number
  /** The memory conversation both sessions share. Typed, not used by the interface yet. */
  conversation_id?: string
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

/** Cost of a turn, with where the figure comes from. `usd: null` = unknown, never zero. */
export interface TurnCost {
  usd?: number | null
  basis: CostBasis
}

/** Token usage of a turn. Every field optional: providers report what they can. */
export interface TurnUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
  reasoning_tokens?: number
}

/** Fields the provider adapter stamps on a tool call so the UI never guesses from the name. */
interface ToolProviderHints {
  /** `command | read | edit | search | web | mcp | agent | other`. */
  category?: ToolCategory
  /** Canonical alias of the tool (`Bash`, `Read`, `Edit`…) for the renderer registry. */
  canonical?: string
}

/** Events nested under a sub-agent's tool call carry its id. */
interface Nested {
  parent_tool_use_id?: string
}

/**
 * When a tool call really ran, as the engine saw it (backend `tool_timing`, sent
 * right after the call's `tool_result` / `tool_cancelled`). Seconds since the
 * epoch, milliseconds as the fraction. The wait for the user is
 * `permission_requested_at`..`permission_resolved_at`; the run is
 * `run_started_at`..`ended_at`, and `run_started_at` is ABSENT when the tool never
 * ran or the engine could not see it start (never an estimate).
 */
export interface ToolTiming {
  id: string
  ended_at: number
  called_at?: number
  started_at?: number
  permission_requested_at?: number
  permission_resolved_at?: number
  permission_outcome?: 'allowed' | 'denied'
  run_started_at?: number
  cancelled?: boolean
  incomplete?: boolean
}

/**
 * `ChatEvent` — the persisted/broadcast events of a session. Mirrors the
 * backend enum `ChatEvent` (`backend/src/chat/types.rs`) variant for variant;
 * the field-level contract test (`chatContract.test.ts`) replays the backend's
 * sample frames against `CHAT_EVENT_FIELDS` below.
 *
 * NOT here: `partial_text` & co. (transport control frames — `ChatControlFrame`)
 * and `viz_block` (never emitted as an event by the backend — `ChatLocalEvent`).
 */
export type ChatEvent =
  | { type: 'user_message'; content: string }
  | ({ type: 'assistant_text'; content: string } & Nested)
  | ({ type: 'stream_delta'; text: string } & Nested)
  | ({ type: 'thinking'; content: string } & Nested)
  | ({ type: 'tool_use'; id: string; tool: string; input: Record<string, unknown> } & ToolProviderHints & Nested)
  | ({ type: 'tool_result'; id: string; result: unknown; is_error?: boolean } & Nested)
  | ({ type: 'tool_use_input_resolved'; id: string; input: Record<string, unknown> } & Nested)
  | { type: 'tool_cancelled'; id: string; parent_tool_use_id?: string }
  | ({ type: 'tool_timing' } & ToolTiming & Nested)
  | ({ type: 'permission_request'; id: string; tool: string; input: Record<string, unknown>; tool_use_id?: string } & ToolProviderHints & Nested)
  | { type: 'permission_decision'; id: string; allow: boolean }
  | ({
      type: 'ask_user_question'
      questions: AskUserQuestion[]
      tool_call_id?: string
      id?: string
      input?: Record<string, unknown>
      /** True when the backend built the question for a provider with no native support: the answer goes back as a user turn. */
      synthetic?: boolean
    } & Nested)
  | {
      type: 'result'
      session_id: string
      duration_ms: number
      cost_usd?: number | null
      subtype?: string
      is_error?: boolean
      num_turns?: number
      result_text?: string
      /** Cost with its basis. When present it wins over the bare `cost_usd`. */
      cost?: TurnCost
      usage?: TurnUsage
      /** Model that actually answered (may differ from the one requested). */
      model?: string
      /** `completed | max_turns | max_tokens | interrupted | refusal | budget_exceeded | error`; `subtype` keeps the native string. */
      stop_reason?: string
      /** Classified failure behind `is_error` (nexus contract v2 `done.error`): a ProviderError with its `kind`. */
      error?: { kind: string; [field: string]: unknown }
    }
  | ({
      type: 'error'
      message: string
      /**
       * Typed refusal (`refs_invalid`…), with the index of the offending entry and why
       * (`unknown_kind`…). Typed for the contract; the transcript shows `message`.
       */
      code?: string
      index?: number
      reason?: string
    } & Nested)
  | { type: 'streaming_status'; is_streaming: boolean }
  | { type: 'permission_mode_changed'; mode: string; tool_policy?: ToolPolicy | ToolPolicyMode; policy_mode?: ToolPolicyMode }
  | { type: 'model_changed'; model: string; reason?: string | null }
  | { type: 'compaction_started'; trigger: string }
  /** Emitted by `close_session`: the session is gone, do not reconnect. `reason`: `closed`, `idle` or `error`. */
  | { type: 'session_closed'; session_id: string; reason?: string }
  /**
   * The conversation moved to another provider. On the thread it LEFT: stored, then
   * `session_closed` (an open tab follows `to_session_id`). On the thread it REACHED:
   * before the user message, "N entries replayed, M left out".
   */
  | {
      type: 'conversation_relayed'
      from_session_id: string
      to_session_id: string
      from_provider: string
      to_provider: string
      relayed_entries: number
      omitted_entries: number
      /** `user` (the switch route) or `auto` (reserved for the router). */
      moved_by: string
      /** Shared memory conversation. Typed, not used by the interface yet. */
      conversation_id?: string
    }
  /** How the server read the references of the user message above (contract C5). */
  | RefsResolvedEvent
  | { type: 'compaction_recovery'; hint_tokens: number; build_latency_ms: number; recovery_success: boolean }
  | { type: 'compact_boundary'; trigger: string; pre_tokens?: number }
  | {
      type: 'system_init'
      /** Claude CLI session id. Absent for a provider that has no such thing. */
      cli_session_id?: string
      model?: string
      tools?: string[]
      mcp_servers?: { name: string; status?: string }[]
      /** Legacy (Claude) permission mode string. */
      permission_mode?: string
      /** Provider instance: an id, or `{ id, kind?, label? }`. ABSENT = `claude-code`. */
      provider?: ProviderId | { id: ProviderId; kind?: ProviderKind; label?: string }
      /** Capabilities of (provider, model), frozen when the session opened. ABSENT = full Claude profile. */
      capabilities?: Partial<ProviderCapabilities>
      /** Neutral policy of the session. */
      tool_policy?: ToolPolicy | ToolPolicyMode
      /** Neutral form of `permission_mode` (which keeps being emitted). */
      policy_mode?: ToolPolicyMode
      /** Engine running the session: `agent`; absent = the legacy Claude Code engine. */
      engine?: string
      /** Feature ids the engine cannot provide for this session. Only present when Claude Code is forced onto `agent`. */
      degraded_features?: string[]
    }
  | { type: 'auto_continue'; session_id: string; delay_ms: number }
  | { type: 'auto_continue_state_changed'; session_id: string; enabled: boolean }
  | { type: 'system_hint'; content: string }
  | { type: 'retrying'; attempt: number; max_attempts: number; delay_ms: number; error_message: string }
  | { type: 'background_output'; source: string; content: string; received_at: string; correlation_id?: string }
  | { type: 'workflow'; subtype: string; data: Record<string, unknown> }
  | { type: 'session_error'; reason: string; message: string; received_at: string; code?: string }
  | { type: 'tools_cancelled'; cli_pid?: number; killed_count: number; requested_by: string }
  | { type: 'active_tasks_update'; tasks: BackgroundTaskInfo[] }
  /** The user messages the session holds until the running turn ends — always the full list. */
  | { type: 'pending_queue'; messages: import('@/components/chat/messageQueue').ServerQueueEntry[] }
  | { type: 'secret_request'; id: string; name: string; reason: string; exists: boolean }
  | { type: 'secret_request_resolved'; id: string; outcome: string }

export type ChatEventType = ChatEvent['type']

/**
 * Every field of every `ChatEvent` variant, as `required` / `optional`.
 *
 * The `satisfies` clause makes this table EXHAUSTIVE AND EXACT at compile
 * time: a variant or a field added to `ChatEvent` without a row here (or a row
 * with no matching field) fails `tsc`. At test time, the contract test replays
 * the backend's sample frames against it: a frame carrying a field that is not
 * listed here — i.e. a field the frontend does not type — fails.
 */
type FieldTable<T> = { [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? 'optional' : 'required' }
type EventFieldTables = { [T in ChatEventType]: FieldTable<Omit<Extract<ChatEvent, { type: T }>, 'type'>> }

export const CHAT_EVENT_FIELDS = {
  user_message: { content: 'required' },
  assistant_text: { content: 'required', parent_tool_use_id: 'optional' },
  stream_delta: { text: 'required', parent_tool_use_id: 'optional' },
  thinking: { content: 'required', parent_tool_use_id: 'optional' },
  tool_use: { id: 'required', tool: 'required', input: 'required', category: 'optional', canonical: 'optional', parent_tool_use_id: 'optional' },
  tool_result: { id: 'required', result: 'required', is_error: 'optional', parent_tool_use_id: 'optional' },
  tool_use_input_resolved: { id: 'required', input: 'required', parent_tool_use_id: 'optional' },
  tool_cancelled: { id: 'required', parent_tool_use_id: 'optional' },
  tool_timing: {
    id: 'required',
    ended_at: 'required',
    called_at: 'optional',
    started_at: 'optional',
    permission_requested_at: 'optional',
    permission_resolved_at: 'optional',
    permission_outcome: 'optional',
    run_started_at: 'optional',
    cancelled: 'optional',
    incomplete: 'optional',
    parent_tool_use_id: 'optional',
  },
  permission_request: { id: 'required', tool: 'required', input: 'required', tool_use_id: 'optional', category: 'optional', canonical: 'optional', parent_tool_use_id: 'optional' },
  permission_decision: { id: 'required', allow: 'required' },
  ask_user_question: { questions: 'required', tool_call_id: 'optional', id: 'optional', input: 'optional', synthetic: 'optional', parent_tool_use_id: 'optional' },
  result: { session_id: 'required', duration_ms: 'required', cost_usd: 'optional', subtype: 'optional', is_error: 'optional', num_turns: 'optional', result_text: 'optional', cost: 'optional', usage: 'optional', model: 'optional', stop_reason: 'optional', error: 'optional' },
  error: { message: 'required', code: 'optional', index: 'optional', reason: 'optional', parent_tool_use_id: 'optional' },
  streaming_status: { is_streaming: 'required' },
  permission_mode_changed: { mode: 'required', tool_policy: 'optional', policy_mode: 'optional' },
  model_changed: { model: 'required', reason: 'optional' },
  compaction_started: { trigger: 'required' },
  session_closed: { session_id: 'required', reason: 'optional' },
  conversation_relayed: {
    from_session_id: 'required',
    to_session_id: 'required',
    from_provider: 'required',
    to_provider: 'required',
    relayed_entries: 'required',
    omitted_entries: 'required',
    moved_by: 'required',
    conversation_id: 'optional',
  },
  refs_resolved: { refs: 'required' },
  compaction_recovery: { hint_tokens: 'required', build_latency_ms: 'required', recovery_success: 'required' },
  compact_boundary: { trigger: 'required', pre_tokens: 'optional' },
  system_init: { cli_session_id: 'optional', model: 'optional', tools: 'optional', mcp_servers: 'optional', permission_mode: 'optional', provider: 'optional', capabilities: 'optional', tool_policy: 'optional', policy_mode: 'optional', engine: 'optional', degraded_features: 'optional' },
  auto_continue: { session_id: 'required', delay_ms: 'required' },
  auto_continue_state_changed: { session_id: 'required', enabled: 'required' },
  system_hint: { content: 'required' },
  retrying: { attempt: 'required', max_attempts: 'required', delay_ms: 'required', error_message: 'required' },
  background_output: { source: 'required', content: 'required', received_at: 'required', correlation_id: 'optional' },
  workflow: { subtype: 'required', data: 'required' },
  session_error: { reason: 'required', message: 'required', received_at: 'required', code: 'optional' },
  tools_cancelled: { cli_pid: 'optional', killed_count: 'required', requested_by: 'required' },
  active_tasks_update: { tasks: 'required' },
  pending_queue: { messages: 'required' },
  secret_request: { id: 'required', name: 'required', reason: 'required', exists: 'required' },
  secret_request_resolved: { id: 'required', outcome: 'required' },
} as const satisfies EventFieldTables

/**
 * Transport control frames of the chat WebSocket. They are written by the
 * socket handler, not by the session, are never persisted and never replayed.
 * `ChatWebSocket` consumes all of them except `partial_text`, which it forwards.
 */
export type ChatControlFrame =
  | { type: 'partial_text'; content: string }
  | { type: 'replay_complete' }
  | { type: 'events_lagged'; skipped?: number }
  | { type: 'session_dormant' }
  /** `features`: capabilities of the server (`refs_v1`…); absent on an older server. */
  | { type: 'auth_ok'; features?: string[] }
  | { type: 'auth_error'; message?: string }

/**
 * Events the reducers understand that the backend does NOT emit as a
 * `ChatEvent` variant: kept so stored/hand-built streams still render.
 */
export type ChatLocalEvent =
  | { type: 'viz_block'; viz_type: string; data: Record<string, unknown>; interactive?: boolean; fallback_text: string; title?: string; max_height?: number }

/** What the live reducer (`useChat.handleEvent`) receives. */
export type ChatStreamEvent =
  | ChatEvent
  | Extract<ChatControlFrame, { type: 'partial_text' }>
  | ChatLocalEvent

/**
 * How far an interrupt reaches.
 *
 * - `turn_and_tools` (default) — end the turn and SIGINT every subprocess
 *   the CLI is running. What the composer's Stop button wants.
 * - `turn` — end the turn only, leaving background `Bash`/`Monitor`
 *   subprocesses alive. Note that in-process `Task` sub-agents die either
 *   way: they live inside the CLI, not beside it.
 */
export type InterruptScope = 'turn' | 'turn_and_tools'

/** Result returned by POST /api/chat/sessions/:id/interrupt. */
export interface InterruptOutcome {
  /**
   * True when a live turn was actually interrupted. False means nothing was
   * stopped locally — read `routed` to tell "handed to another instance"
   * from "went nowhere". The UI must clear its "Stopping…" state on false,
   * or it spins forever waiting for a `result` event that never comes.
   */
  delivered: boolean
  /** Where the interrupt went: `local`, `nats`, or `none`. */
  routed: string
  cli_pid: number | null
  /** PIDs that received SIGINT. Always empty for scope `turn`. */
  killed_pids: number[]
  /**
   * Answer to `cascade: true`: how many sessions of the subtree were stopped out
   * of how many were live. Absent = the server does not know `cascade`, and only
   * the session itself was interrupted.
   */
  cascade?: { stopped: number; total: number } | null
}

/** Result returned by POST /api/chat/sessions/:id/cancel-tools (T2/T3 of plan 28e9afe3). */
export interface CancelToolsResult {
  cli_pid: number | null
  killed_pids: number[]
  /** True when the per-session rate cap (10/60s) was hit — no SIGINT sent. */
  capped: boolean
}

// ============================================================================
// BACKGROUND TASKS — Plan 754a1379 (backend) + plan 5985a7c4 (frontend UX)
// ============================================================================

/**
 * Kind of background subprocess being tracked. Mirrors the backend
 * `BackgroundTaskKind` enum (`src/chat/types.rs`). The wire format
 * uses snake_case discriminator strings.
 *
 * Currently we track tools that spawn long-living subprocesses surviving
 * across multiple turns:
 * - `monitor` — `Monitor` tool (one stdout line = one event, never
 *   completes on its own).
 * - `bash_background` — `Bash` tool invoked with `run_in_background: true`
 *   (BashOutput events as stdout chunks land).
 */
export type BackgroundTaskKind = 'monitor' | 'bash_background'

/**
 * Snapshot of a single background subprocess attached to a chat session.
 * Carried by `ChatEvent::active_tasks_update` and the REST endpoint
 * `GET /api/chat/sessions/:id/background-tasks`.
 *
 * ## Identity (3-name aliasing — see backend pattern note 626ddbf5)
 *
 * `id` is the SDK Claude Code `tool_use_id` of the originating
 * `Monitor` / `Bash` invocation — i.e. the same value that surfaces on
 * `ChatEvent.background_output.correlation_id` for every event emitted
 * by this subprocess. Three names, one value:
 *
 * - `parent_tool_use_id` (SDK Message payload)
 * - `correlation_id` (background_output ChatEvent)
 * - `id` (this interface, used as map key on the frontend)
 *
 * This intentional alias is what lets us group `background_output`
 * events under their parent MonitorCard with a single hashmap lookup.
 *
 * ## Recovery (`(recovered after restart)`)
 *
 * After a server restart, recovered tasks have a synthetic description
 * ("(recovered after restart)") because the original was lost. The UI
 * should still render them normally — they're cancellable like any
 * other entry.
 */
export interface BackgroundTaskInfo {
  /** SDK tool_use ID — same value as `correlation_id` on related `background_output` events. Map key. */
  id: string
  /** What kind of subprocess this is. */
  kind: BackgroundTaskKind
  /**
   * Human-readable description (typically the `description` argument
   * the agent passed to the tool). After a server restart, recovered
   * entries carry the placeholder `(recovered after restart)`.
   */
  description: string
  /** ISO-8601 timestamp at which the OOB listener first observed this task. */
  started_at: string
  /**
   * Last time the backend observed activity (most recent matching
   * `background_output` tick). Used by the UI to show "Active for Xm"
   * and by the backend's idle-death detector (entries silent for
   * >30 min are reaped).
   */
  last_seen_at: string
  /**
   * PID of the root subprocess. **Always `null` in V1** — V1 does
   * not perform PID discovery (cf backend gotcha note 33f7431e). The
   * field is on the wire format for forward compatibility with the
   * eventual PID-aware cancel.
   */
  pid?: number | null
  /**
   * SDK `parent_tool_use_id` of the invoking turn. Typically equal to
   * `id`, but kept distinct for the recovery case where the original
   * tool_use is no longer known.
   */
  parent_tool_use_id?: string | null
}

/**
 * Result returned by `POST /api/chat/sessions/:id/cancel-task/:task_id`
 * (T7+T8 of plan 754a1379). The frontend uses it to update the
 * cancelled task's UI state and surface rate-cap hits gracefully.
 *
 * In V1 `killed_pids` is always empty — the backend cancel path is
 * map-side only (entry marked for removal + broadcast); the
 * underlying subprocess keeps running until the global Stop is hit
 * or the session ends. Cf backend gotcha note 33f7431e.
 */
export interface CancelTaskResult {
  /** `tool_use_id` of the task that was cancelled — echoed back. */
  task_id: string
  /** PIDs that received SIGINT. **Always empty in V1** (no PID-targeted kill yet). */
  killed_pids: number[]
  /** True when the per-session rate cap (30/5min) was hit — no map mutation, no broadcast. */
  capped: boolean
}

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
  /** Workspace slug if session was started on a workspace */
  workspace_slug?: string
  conversation_id: string
  hits: MessageSearchHit[]
  best_score: number
}

// ============================================================================
// UI DISPLAY TYPES
// ============================================================================

export interface ContentBlock {
  id: string
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'permission_request' | 'ask_user_question' | 'error' | 'compact_boundary' | 'model_changed' | 'result_max_turns' | 'result_error' | 'system_init' | 'system_hint' | 'continue_indicator' | 'retry_indicator' | 'viz' | 'background_activity' | 'conversation_relayed' | 'session_closed' | 'compaction_recovery'
  content: string
  metadata?: Record<string, unknown>
}

/**
 * One background-subagent progress tick, as stored under a `tool_use`
 * block's `metadata.child_outputs` (F6) or a `background_activity`
 * block's `metadata.entries` (F10).
 */
export interface BackgroundOutputEntry {
  source: string
  content: string
  received_at: string
  /** Workflow lifecycle subtype (`task_started` / `task_progress` / …) when the tick came from a `workflow` event. */
  subtype?: string
}

/** Cap on the entries kept on a `background_activity` block (count keeps growing). */
export const BACKGROUND_ACTIVITY_MAX_ENTRIES = 20

/**
 * `metadata` of a `background_activity` ContentBlock (F10 — orphan
 * tolerance). Produced when a `background_output` / `workflow` tick has
 * no parent `tool_use` block in the loaded window: rather than dropping
 * the tick, the assembler groups every orphan sharing a
 * `correlation_id` into one such block on the current assistant message.
 */
export interface BackgroundActivityMetadata {
  /** Grouping key: `correlation_id` (background_output) / `data.tool_use_id` (workflow). */
  correlation_id?: string
  /** Source of the latest tick (`Monitor`, `BashOutput`, `Workflow`…). */
  source: string
  /** Total ticks folded into this block — may exceed `entries.length`. */
  count: number
  first_received_at: string
  last_received_at: string
  subagent_type?: string
  description?: string
  /**
   * Structured payload of `workflow` ticks (task_id, workflow_name,
   * workflow_progress[], usage, status…), shallow-merged in arrival order
   * so the latest values win. Absent for plain `background_output` ticks.
   */
  data?: Record<string, unknown>
  /** The last `BACKGROUND_ACTIVITY_MAX_ENTRIES` ticks, oldest first. */
  entries: BackgroundOutputEntry[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  /** Documents attached to a user message (rendered as chips under the text). */
  attachments?: MessageAttachment[]
  /** References of a user message: chips in the bubble, statuses from `refs_resolved`. */
  refs?: ChatReference[]
  timestamp: Date
  /** Total turn duration in ms (from backend result event) */
  duration_ms?: number
  /** Total turn cost in USD (from backend result event). Absent when there is no figure — never zero by default. */
  cost_usd?: number
  /** Where `cost_usd` comes from. Absent on a message built before this existed: read as `reported`. */
  cost_basis?: CostBasis
  /** Token usage of the turn, as far as the provider reported it. */
  usage?: TurnUsage
  /** True when the agent is actively streaming this message */
  isStreaming?: boolean
}

export type ChatPanelMode = 'closed' | 'open' | 'fullscreen'

// ============================================================================
// SESSION TREE & AGENT EXECUTIONS
// ============================================================================

/** A node in the session tree (hierarchical view of spawned sessions) */
export interface SessionTreeNode {
  session_id: string
  parent_session_id?: string | null
  spawn_type?: string | null
  run_id?: string | null
  task_id?: string | null
  depth: number
  created_at?: string | null
  // Enriched fields (from T1 backend)
  title?: string | null
  model?: string | null
  total_cost_usd?: number | null
  is_streaming: boolean
  /** Provider instance of this node. Absent = `claude-code`. */
  provider_id?: ProviderId | null
  /** Where `total_cost_usd` comes from. Absent = `reported`. */
  cost_basis?: CostBasis | null
  /** Cost of this node plus every descendant, when the server computes it. */
  subtree_cost_usd?: number | null
  /** Tokens of this node alone, when the provider reported them (cost breakdown by model). */
  input_tokens?: number | null
  output_tokens?: number | null
  /** Limits of the tree, when the server enforces them (usually on the root). */
  max_depth?: number | null
  max_children?: number | null
}

/** An agent execution record for a plan run */
export interface AgentExecution {
  id: string
  run_id: string
  task_id: string
  session_id?: string | null
  started_at: string
  completed_at?: string | null
  /** `null` = no figure. Not zero. */
  cost_usd: number | null
  /** Where `cost_usd` comes from. Absent = `reported`. */
  cost_basis?: CostBasis | null
  duration_secs: number
  /** `interrupted`: left `running` by a process that is gone; whether it finished is unknown. */
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'interrupted'
  tools_used?: string | null  // JSON string
  files_modified: string[]
  commits: string[]
  persona_profile?: string | null
  // Routing facts (all additive: a pre-provider backend sends none, which reads as Claude Code).
  /** Provider instance that ran it. Absent = `claude-code`. */
  provider_id?: ProviderId | null
  /** What the caller asked for (model id or alias) — may differ from `model`. */
  model_requested?: string | null
  /** Model that actually ran. */
  model?: string | null
  /** Alias the request went through, if any. */
  model_alias?: string | null
  /** Which rule chose the provider/model (`routed_by` of the resolved default). */
  routed_by?: RoutedBy | null
  /** Name of the project/global rule, when a rule chose. */
  route_rule?: string | null
  /** Why the run left the requested model (`fallback`, `provider_unavailable`…). */
  fallback_reason?: string | null
  /** Model a shadow routing policy WOULD have used (observation only, nothing ran on it). */
  shadow_model?: string | null
  task_class?: string | null
  /** 1 = first try; above = a retry. */
  attempt?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
}

/** Lightweight session info returned by run-level endpoints */
export interface SessionInfo {
  id: string
  title?: string | null
  model?: string | null
  created_at: string
  updated_at?: string | null
  total_cost_usd?: number | null
  /** Where `total_cost_usd` comes from. Absent = `reported`. */
  cost_basis?: CostBasis | null
  is_streaming: boolean
}

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/** Connection status for the chat WebSocket */
export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** Messages sent from the client to the server over WebSocket */
export type WsChatClientMessage =
  // `attachments` (document ids) is omitted when there are none: the backend's
  // `ClientMessage::UserMessage` gains the field in parallel with this, and an
  // absent field deserializes identically on both versions.
  // `queue: true`: if a response is running, the session holds the message until
  // it ends instead of interrupting it. Omitted otherwise.
  | { type: 'user_message'; content: string; attachments?: string[]; queue?: true; refs?: EntityRef[] }
  | ({ type: 'queue_op' } & import('@/components/chat/messageQueue').QueueOp)
  /** Ask the session for the messages it holds; answered by a `pending_queue` event. */
  | { type: 'queue_op'; op: 'snapshot' }
  | { type: 'interrupt' }
  /** Cancel the running tools WITHOUT ending the turn. */
  | { type: 'cancel_tools' }
  | { type: 'permission_response'; id?: string; allow: boolean }
  | { type: 'input_response'; id?: string; content: string }
  | { type: 'set_permission_mode'; mode: string }
  | { type: 'set_model'; model: string }
  | { type: 'set_auto_continue'; enabled: boolean }

/** Every client message type — exhaustive by construction (`satisfies`). */
export const WS_CLIENT_MESSAGE_TYPES = {
  user_message: true,
  queue_op: true,
  interrupt: true,
  cancel_tools: true,
  permission_response: true,
  input_response: true,
  set_permission_mode: true,
  set_model: true,
  set_auto_continue: true,
} as const satisfies Record<WsChatClientMessage['type'], true>

/** Every transport control frame type — exhaustive by construction. */
export const CHAT_CONTROL_FRAME_TYPES = {
  partial_text: true,
  replay_complete: true,
  events_lagged: true,
  session_dormant: true,
  auth_ok: true,
  auth_error: true,
} as const satisfies Record<ChatControlFrame['type'], true>

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
