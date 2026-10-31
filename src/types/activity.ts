/**
 * Types of the Live Activity Hub — the hand mirror of the Rust DTOs.
 *
 * Two halves, both served by the backend:
 * - `ActivitySnapshot` — `GET /api/activity/snapshot`: what is running now.
 * - `ActivityEvent` — `/ws/activity`: what just happened, normalized, sequenced.
 *
 * They are kept aligned by hand because the Rust side is the contract
 * (`src/api/activity_handlers.rs` for the snapshot, `src/events/activity.rs`
 * for the events). When a field appears there, it appears here in the same PR.
 */

/** The axis the hub groups, counts and filters on. */
export type ActivityCategory = 'plan_run' | 'protocol_run' | 'chat_session' | 'entity' | 'system'

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  'plan_run',
  'protocol_run',
  'chat_session',
  'entity',
  'system',
]

/**
 * One normalized event of the live feed.
 *
 * `seq` is strictly increasing per server process: it is the replay cursor the
 * client hands back to `/ws/activity?last_seq=` after a reconnect.
 */
export interface ActivityEvent {
  seq: number
  /** RFC 3339 timestamp of the mutation. */
  ts: string
  category: ActivityCategory
  /** Graph entity type as emitted (`runner`, `task`, `protocol_run`, …). */
  entity_type: string
  /** For a run or a conversation, this *is* the run/session id. */
  entity_id: string
  action: string
  /** Resolved by the server when the emitter did not stamp it. */
  project_id?: string
  title?: string
  status?: string
  /** The emitter's own payload (a `RunnerEvent` for a plan run, …). */
  detail?: unknown
}

/** A frame of `/ws/activity`. */
export type ActivityFrame =
  | { kind: 'ready'; seq: number; replayed: number }
  | { kind: 'activity'; event: ActivityEvent }
  | { kind: 'lag_dropped'; skipped: number }

/** One task an agent is working on inside a plan run. */
export interface ActiveTaskActivity {
  task_id: string
  title: string
  session_id?: string
  status: string
  elapsed_secs: number
  cost_usd: number
}

/** A plan execution in flight. */
export interface PlanRunActivity {
  run_id: string
  plan_id: string
  plan_title?: string
  status: string
  current_wave: number
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  active_tasks: ActiveTaskActivity[]
  git_branch: string
  cwd?: string
  started_at: string
  elapsed_secs: number
  cost_usd: number
  tokens_used: number
  lifecycle_run_id?: string
}

/** An FSM protocol execution in flight. */
export interface ProtocolRunActivity {
  run_id: string
  protocol_id: string
  protocol_name?: string
  current_state: string
  current_state_name?: string
  status: string
  states_visited: number
  project_id?: string
  plan_id?: string
  task_id?: string
  parent_run_id?: string
  triggered_by: string
  started_at: string
  elapsed_secs: number
}

/** What a conversation is doing right now. */
export interface ChatActivity {
  live: boolean
  streaming: boolean
  pending_permissions: number
  monitors: number
  bash_tasks: number
}

/** A conversation that is doing something. */
export interface ChatSessionActivity {
  session_id: string
  title?: string
  model: string
  provider_id?: string
  project_slug?: string
  message_count: number
  cost_usd?: number
  updated_at: string
  idle_secs: number
  preview?: string
  activity: ChatActivity
}

/** Counts per family, so the tabs can render before the lists are read. */
export interface ActivityCounts {
  plan_runs: number
  protocol_runs: number
  chat_sessions: number
  total: number
}

/** Body of `GET /api/activity/snapshot`. */
export interface ActivitySnapshot {
  generated_at: string
  /** Pass to `/ws/activity?last_seq=` to receive only what happened after it. */
  last_event_seq: number
  project_id?: string
  workspace_slug?: string
  counts: ActivityCounts
  plan_runs: PlanRunActivity[]
  protocol_runs: ProtocolRunActivity[]
  chat_sessions: ChatSessionActivity[]
}
