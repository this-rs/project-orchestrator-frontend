/**
 * Contract of `GET /api/agents/live` — every agent whose CLI is running now.
 *
 * Mirror of the backend `LiveAgentsResponse` (`src/api/attention_aggregate.rs`).
 * snake_case on the wire, timestamps RFC 3339 UTC, ages computed server-side
 * against `generated_at`.
 */

import type { CostBasis } from './provider'

export const LIVE_AGENT_STATES = ['waiting_input', 'streaming', 'idle'] as const
export type LiveAgentState = (typeof LIVE_AGENT_STATES)[number]

export interface LiveAgent {
  session_id: string
  title: string
  preview: string | null
  project_slug: string | null
  workspace_slug: string | null
  model: string
  cwd: string
  /** `user` for a plain chat, else the `spawned_by` type (`runner`, `delegate`, …). */
  origin: string
  run_id: string | null
  plan_id: string | null
  task_id: string | null
  state: LiveAgentState
  /** Permissions/questions still waiting (0 unless `waiting_input`). */
  pending_requests: number
  started_at: string
  updated_at: string
  age_secs: number
  idle_secs: number
  message_count: number
  total_cost_usd: number | null
  /** Where `total_cost_usd` comes from. Absent = `reported` (Claude Code). */
  cost_basis?: CostBasis | null
}

export interface LiveAgentsResponse {
  generated_at: string
  agents: LiveAgent[]
  total: number
  waiting_input: number
  streaming: number
  idle: number
}
