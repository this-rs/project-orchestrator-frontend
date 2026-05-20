/**
 * Activity Hub types — hand-mirror of the backend Rust schema.
 *
 * Source of truth: `src/events/activity.rs` (ActivityEvent + helpers) and
 * `src/api/models/activity.rs` (ActivitySnapshot + summaries) in the
 * project-orchestrator backend crate.
 *
 * The backend serializes ActivityEvent as a discriminated union tagged by
 * `kind` (snake_case) and the WebSocket envelope frames as a discriminated
 * union tagged by `type` (snake_case). Both are mirrored faithfully here so
 * the frontend can consume `/api/activity/snapshot` + `/ws/activity` without
 * any unsafe `any` casts.
 *
 * Verification: `tsc --noEmit` is clean as long as this file matches the
 * Rust definitions; whenever a backend variant is added, mirror it here.
 */

import type { ChatEvent, CrudAction, EntityType } from '@/types'

// ============================================================================
// Shared scalar types
// ============================================================================

/** ISO-8601 timestamp string (chrono::DateTime<Utc>::to_rfc3339 on the wire). */
export type IsoTimestamp = string

/** Sequence number assigned by the backend EventBus (monotonic u64). */
export type EventSeq = number

// ============================================================================
// RunnerEvent — mirror of `runner::models::RunnerEvent`
// ============================================================================

/**
 * Plan-run-level status produced by the runner state machine (subset that
 * appears on the wire — `serde(rename_all = "snake_case")`).
 */
export type PlanRunStatus =
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'
  | 'budget_exceeded'

/**
 * Run-time prediction emitted on `plan_started` (optional payload).
 *
 * Mirrored loosely as a record — the backend only computes this when historical
 * runs exist and the UI just reads scalar fields.
 */
export interface RunnerPrediction {
  /** Predicted total cost (USD). */
  predicted_cost_usd?: number
  /** Predicted total duration (seconds). */
  predicted_duration_secs?: number
  /** Sample size that fed the prediction. */
  sample_size?: number
  /** Allow extra prediction fields without breaking the contract. */
  [key: string]: unknown
}

/**
 * Plan-runner events serialized with `#[serde(tag = "event", rename_all = "snake_case")]`.
 *
 * Every variant carries `run_id`; the optional payload fields are the same as
 * `runner::models::RunnerEvent`.
 */
export type RunnerEvent =
  | {
      event: 'plan_started'
      run_id: string
      plan_id: string
      plan_title: string
      total_tasks: number
      total_waves: number
      prediction?: RunnerPrediction
    }
  | {
      event: 'wave_started'
      run_id: string
      wave_number: number
      task_count: number
    }
  | {
      event: 'task_started'
      run_id: string
      task_id: string
      task_title: string
      wave_number: number
    }
  | {
      event: 'task_completed'
      run_id: string
      task_id: string
      task_title: string
      cost_usd: number
      duration_secs: number
    }
  | {
      event: 'task_failed'
      run_id: string
      task_id: string
      task_title: string
      reason: string
      attempts: number
    }
  | {
      event: 'task_timeout'
      run_id: string
      task_id: string
      task_title: string
      duration_secs: number
    }
  | {
      event: 'wave_completed'
      run_id: string
      wave_number: number
      tasks_completed: number
      tasks_failed: number
    }
  | {
      event: 'plan_completed'
      run_id: string
      plan_id: string
      status: PlanRunStatus
      total_cost_usd: number
      total_duration_secs: number
      tasks_completed: number
      tasks_failed: number
      pr_url: string | null
    }
  | {
      event: 'task_completed_without_steps'
      run_id: string
      task_id: string
      task_title: string
      steps_skipped: number
      steps_total: number
    }
  | {
      event: 'cwd_mismatch'
      run_id: string
      cwd: string
      root_path: string
    }
  | {
      event: 'task_spawning_timeout'
      run_id: string
      task_id: string
      task_title: string
      timeout_secs: number
    }
  | {
      event: 'runner_error'
      run_id: string
      message: string
    }
  | {
      event: 'budget_exceeded'
      run_id: string
      plan_id: string
      cumulated_cost_usd: number
      limit_usd: number
    }
  | {
      event: 'worktree_recovery'
      run_id: string
      wave_number: number
      commits_recovered: number
      conflicts: number
      worktrees_cleaned: number
    }
  | {
      event: 'lifecycle_transition'
      run_id: string
      lifecycle_run_id: string
      from_state: string
      to_state: string
      trigger: string
    }

// ============================================================================
// Protocol FSM progress payload
// ============================================================================

/** Status of a protocol FSM run (`protocol::models::RunStatus`). */
export type ProtocolRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Mirror of `events::activity::ProtocolProgressSnapshot`. Emitted inline with
 * `protocol_progress` ActivityEvents to expose sub-action progress.
 */
export interface ProtocolProgressSnapshot {
  sub_action: string
  processed: number
  total: number
  elapsed_ms: number
}

// ============================================================================
// ActivityEvent — unified discriminated union (`kind` tag)
// ============================================================================

/**
 * Live Activity Hub event envelope.
 *
 * Mirrors `events::activity::ActivityEvent` (serde tag = "kind", snake_case).
 *
 * Variants
 * - `runner`            — plan runner lifecycle event
 * - `chat`              — filtered chat event (StreamDelta etc. dropped at source)
 * - `crud`              — filtered CRUD on {Plan, Task, ProtocolRun, ChatSession}
 * - `protocol_progress` — protocol FSM state + optional sub-action progress
 */
export type ActivityEvent =
  | {
      kind: 'runner'
      seq: EventSeq
      timestamp: IsoTimestamp
      run_id: string
      event: RunnerEvent
    }
  | {
      kind: 'chat'
      seq: EventSeq
      timestamp: IsoTimestamp
      session_id: string
      task_id?: string
      run_id?: string
      event: ChatEvent
    }
  | {
      kind: 'crud'
      seq: EventSeq
      timestamp: IsoTimestamp
      entity_type: EntityType
      action: CrudAction
      entity_id: string
      project_id?: string
      /** Backend serializes `payload` as `serde_json::Value` — keep it flexible. */
      payload?: Record<string, unknown> | null
    }
  | {
      kind: 'protocol_progress'
      seq: EventSeq
      timestamp: IsoTimestamp
      run_id: string
      protocol_id: string
      current_state: string
      state_name: string
      status: ProtocolRunStatus
      progress?: ProtocolProgressSnapshot
    }

/** Narrowing helper — returns the `kind` discriminator. */
export function activityEventKind(evt: ActivityEvent): ActivityEvent['kind'] {
  return evt.kind
}

// ============================================================================
// WebSocket outgoing frames (`/ws/activity`, server → client)
// ============================================================================

/**
 * Frame envelopes sent by `/ws/activity` (tag = `type`, snake_case). Mirrors
 * `api::ws_activity_handler::OutFrame`.
 */
export type ActivityWsFrame =
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'lag_dropped'; skipped: number }
  | { type: 'connected'; last_seq: EventSeq; replayed: number }

/** Auth handshake frame the backend sends before activity frames. */
export interface AuthOkFrame {
  type: 'auth_ok'
  email?: string
}

export interface AuthErrorFrame {
  type: 'auth_error'
  reason?: string
}

/** Union of any frame the client may receive over `/ws/activity`. */
export type AnyActivityWsFrame = ActivityWsFrame | AuthOkFrame | AuthErrorFrame

// ============================================================================
// REST snapshot — `/api/activity/snapshot`
// ============================================================================

/** Plan-run status as exposed by the snapshot endpoint (currently always `running`). */
export type SnapshotPlanRunStatus = 'running'
/** Protocol-run status as exposed by the snapshot endpoint (currently always `running`). */
export type SnapshotProtocolRunStatus = 'running'

/** Mirror of `api::models::activity::PlanRunSummary`. */
export interface PlanRunSummary {
  run_id: string
  plan_id: string
  plan_title: string
  total_tasks: number
  current_wave: number
  completed_tasks: number
  failed_tasks: number
  status: SnapshotPlanRunStatus
  cost_usd: number
  started_at: IsoTimestamp
  current_task_id?: string
  current_task_title?: string
  git_branch?: string
}

/** Mirror of `api::models::activity::ProtocolRunSummary`. */
export interface ProtocolRunSummary {
  id: string
  protocol_id: string
  protocol_name: string
  current_state: string
  state_name: string
  status: SnapshotProtocolRunStatus
  states_visited: number
  started_at: IsoTimestamp
  plan_id?: string
  task_id?: string
  depth: number
}

/** Mirror of `api::models::activity::ChatSessionSummary`. */
export interface ChatSessionSummary {
  id: string
  title?: string
  model: string
  message_count: number
  updated_at: IsoTimestamp
  total_cost_usd?: number
  preview?: string
  project_slug?: string
}

/** Full snapshot returned by `GET /api/activity/snapshot`. */
export interface ActivitySnapshot {
  plan_runs: PlanRunSummary[]
  protocol_runs: ProtocolRunSummary[]
  chat_sessions: ChatSessionSummary[]
  /** Head of the global event sequence at snapshot time. */
  last_event_seq: EventSeq
}

/** Filters accepted by `GET /api/activity/snapshot` and `/ws/activity`. */
export interface ActivityFilters {
  project_id: string
  project_slug?: string
  /** Cap on the number of chat sessions returned by the snapshot. */
  chat_limit?: number
  /** Optional kinds / entity types whitelist (CSV expected on the wire). */
  entity_types?: string[]
  /** Optional statuses whitelist (CSV expected on the wire). */
  statuses?: string[]
}
