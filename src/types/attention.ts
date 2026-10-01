/**
 * Contract of `GET /api/attention` — the cross-workspace Today cockpit.
 *
 * Mirror of the backend DTOs (`src/api/attention.rs`). Everything is
 * snake_case on the wire; `Option` fields are always present (`null`), never
 * omitted; timestamps are RFC 3339 UTC strings; `age_secs` is computed
 * server-side against `generated_at`. Every list is sorted by waiting age,
 * oldest first.
 *
 * The enum vocabularies are `as const` arrays so the types and the runtime
 * checks (`services/attention.ts`) cannot drift apart. They are also compared
 * with the shared `enums.json` fixture, which the Rust side checks too.
 */

export const BANDS = ['waiting', 'running', 'stuck', 'thinking'] as const
/** The four bands. A thread sits in exactly one. */
export type Band = (typeof BANDS)[number]

export const WAVE_POINT_STATUSES = ['done', 'running', 'pending', 'waiting', 'failed', 'blocked'] as const
export type WavePointStatus = (typeof WAVE_POINT_STATUSES)[number]

export const ATTENTION_RUN_STATUSES = ['running', 'completed', 'failed', 'budget_exceeded', 'cancelled'] as const
export type AttentionRunStatus = (typeof ATTENTION_RUN_STATUSES)[number]

export const STUCK_REASONS = ['failed', 'budget_exceeded', 'task_blocked', 'session_error', 'orphan_request'] as const
export type StuckReason = (typeof STUCK_REASONS)[number]

export const REQUEST_KINDS = ['permission', 'question'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]

export const RUNNER_STATUSES = ['free', 'busy'] as const
export type RunnerStatus = (typeof RUNNER_STATUSES)[number]

export const THINKING_KINDS = ['rfc', 'decision', 'note_review', 'alert'] as const
export type ThinkingKind = (typeof THINKING_KINDS)[number]

export interface WorkspaceRef {
  id: string
  slug: string
  name: string
}

export interface WavePoint {
  task_id: string
  status: WavePointStatus
}

export interface WaveSummaryDto {
  /** 1-indexed. */
  wave_number: number
  points: WavePoint[]
}

export interface PlanRef {
  id: string
  title: string
}

export interface TaskRef {
  id: string
  title: string
}

export interface AttentionRunRef {
  id: string
  status: AttentionRunStatus
  started_at: string
  duration_secs: number
  /** Updated in place by clients, never interpolated. */
  cost_usd: number
}

/** What "Resume" would do — shown BEFORE the click (runner skips done AND blocked). */
export interface ResumePreview {
  done_count: number
  skipped_blocked: TaskRef[]
  rerun_count: number
}

/** The unit of the cockpit: plan + run + sessions. */
export interface AttentionThread {
  id: string
  title: string
  /** Slug of the lane (matches `lanes[].slug`). */
  workspace: string
  band: Band
  /** Set iff `band === 'stuck'`. */
  stuck_reason: StuckReason | null
  plan: PlanRef | null
  run: AttentionRunRef | null
  session_ids: string[]
  since: string
  age_secs: number
  waves: WaveSummaryDto[]
  blocked_tasks: TaskRef[]
  resume: ResumePreview | null
}

export interface QuestionOption {
  label: string
  description: string | null
}

/** A LIVE agent is stopped on the user. */
export interface WaitingRequest {
  request_id: string
  kind: RequestKind
  session_id: string
  thread_id: string | null
  workspace: string
  /** Tool asking for permission (`kind === 'permission'`). */
  tool_name: string | null
  /** EXACT text (command or question), never truncated. */
  text: string
  /** Offered answers for a question; empty otherwise. */
  options: QuestionOption[]
  seq: number
  requested_at: string
  age_secs: number
}

/** Same shape as a waiting request, whose CLI is dead. Never "Allow", only "Continue". */
export interface OrphanRequest extends WaitingRequest {
  /** Since when the CLI is stopped; null when unknown. */
  cli_stopped_at: string | null
}

export interface RunnerOccupant {
  plan_id: string
  plan_title: string
  run_id: string
  workspace: string
  since: string
}

export interface RunnerState {
  status: RunnerStatus
  /** Non-null iff `status === 'busy'`. */
  busy_with: RunnerOccupant | null
}

export interface ThinkingItem {
  id: string
  kind: ThinkingKind
  title: string
  workspace: string | null
  /** Entity status as stored (`proposed`, `needs_review`, ...). */
  status: string
  thread_id: string | null
  since: string
  age_secs: number
}

export interface AttentionResponse {
  generated_at: string
  lanes: WorkspaceRef[]
  threads: AttentionThread[]
  /** Actionable requests (live session) — band 1. */
  waiting: WaitingRequest[]
  /** Requests whose CLI is dead — band 3. */
  orphans: OrphanRequest[]
  runner: RunnerState
  thinking: ThinkingItem[]
}
