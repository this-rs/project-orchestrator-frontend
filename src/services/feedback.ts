import { api, buildQuery } from './api'

/**
 * What a human verdict can rate. Mirrors `FeedbackTarget` in the backend, whose
 * variants serialise in snake_case.
 */
export type FeedbackTarget = 'note' | 'decision' | 'plan' | 'task' | 'commit' | 'reasoning_path'

/** One rated target, as `GET /api/feedback/stats` reports it. */
export interface FeedbackStat {
  target_id: string
  target_type: string
  count: number
  avg_score: number
  min_score: number
  max_score: number
}

/**
 * `GET /api/feedback/stats`.
 *
 * These two numbers are the ones that were invisible: `total_feedback_count` is how many
 * times a HUMAN judged a piece of work, and `avg_score` is what they thought. At zero,
 * nothing can be learned — and that is exactly what this surface is meant to make obvious
 * rather than silent.
 */
export interface FeedbackStatsResponse {
  stats: FeedbackStat[]
  total_feedback_count: number
  avg_score: number
}

/** `POST /api/feedback` — a human verdict, stored where every learning signal already goes. */
export interface VerdictInput {
  target_type: FeedbackTarget
  target_id: string
  /** In [-1.0, +1.0]. The backend rejects anything outside. */
  score: number
  comment?: string
  project_id?: string
  session_id?: string
}

/** What the backend echoes back for a recorded verdict. */
export interface RecordedFeedback {
  id: string
  target_type: FeedbackTarget
  target_id: string
  score: number
  comment?: string
  submitted_by: string
  created_at: string
}

export const feedbackApi = {
  stats: (params: { project_id?: string; target_type?: string; target_id?: string } = {}) =>
    api.get<FeedbackStatsResponse>(`/feedback/stats${buildQuery(params)}`),

  /**
   * Record a human verdict.
   *
   * The caller must be a PERSON: the backend treats a status change carrying a session id
   * as an agent's own claim, and refuses it as a verdict. Do not call this from an agent
   * path — a verdict an agent gives itself is not a verdict.
   */
  submit: (input: VerdictInput) => api.post<RecordedFeedback>('/feedback', input),
}
