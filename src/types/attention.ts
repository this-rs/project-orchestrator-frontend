/**
 * Contract of `GET /api/attention` — the cross-workspace Today view.
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

/**
 * Which mechanism attaches a session to a thread. A session may carry several
 * links (one per mechanism); the provenance is kept so the UI can say
 * "rattache au run X" / "a la tache Y". The frontend never computes the
 * membership itself.
 */
export const LINK_VIAS = ['runner_run', 'spawned_by_json', 'task_association', 'plan_association'] as const
export type LinkVia = (typeof LINK_VIAS)[number]

export const SESSION_STATES = ['live', 'dead'] as const
export type SessionState = (typeof SESSION_STATES)[number]

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

/** One link between a session and a thread (de-duplicated, provenance kept). */
export interface SessionLink {
  via: LinkVia
  run_id: string | null
  task_id: string | null
  plan_id: string | null
}

/** A session of a thread; `links` is never empty. After a resume, old sessions keep the OLD run_id. */
export interface ThreadSession {
  id: string
  title: string
  state: SessionState
  links: SessionLink[]
}

/** The unit of Today: plan + run + sessions. */
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
  /** Same sessions as `session_ids`, with their links. */
  sessions: ThreadSession[]
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

/** A session with NO link: never dropped, shown in its lane with its pending requests. */
export interface UnattachedSession {
  id: string
  /** Slug of the lane (matches `lanes[].slug`). */
  workspace_slug: string
  title: string
  state: SessionState
  /** Pending requests (thread_id is null). Listed here only, not in waiting/orphans. */
  pending: WaitingRequest[]
  since: string
  age_secs: number
}

/** A source the aggregator could not read; the bands that depend on it are incomplete. */
export interface SourceError {
  source: string
  bands: Band[]
  message: string
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
  /** Sessions without any link, grouped by lane (lane order, then oldest first). */
  unattached: UnattachedSession[]
  /** Present ONLY when a source failed; absent = every source answered. */
  source_errors?: SourceError[]
}
