/**
 * Discussions service — fetches the discussion tree for a chat session.
 *
 * GET /api/chat/sessions/{sessionId}/tree -> DiscussionNode
 */

import type { CostBasis } from '@/types/provider'
import { api } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscussionNodeMetadata {
  /** Origin type: 'runner' | 'conversation' | 'root' */
  type: string
  /** Runner run_id if spawned by a runner */
  run_id?: string
  /** Task id if spawned by a runner */
  task_id?: string
  /** How the session reached the entity it is listed under: 'runner' | 'manual' | 'transitive' */
  source?: string
  /** True when the entity route listed this session itself (false: only found as a child of a listed one) */
  linked?: boolean
  /** One useful line from the former flat list (linked tasks, preview) */
  detail?: string
}

export interface DiscussionNode {
  session_id: string
  title: string | null
  status: 'streaming' | 'completed' | 'failed' | 'idle'
  /** `null` = no figure for this session. Not zero. */
  cost_usd: number | null
  /** Where `cost_usd` comes from. Absent = `reported`. */
  cost_basis?: CostBasis | null
  duration_secs: number
  message_count: number
  children: DiscussionNode[]
  metadata: DiscussionNodeMetadata
}

/**
 * Flat node returned by the backend GET /api/chat/sessions/{id}/tree.
 * The backend returns a flat list with parent_session_id + depth;
 * the hook reconstructs the nested tree in the frontend.
 */
export interface SessionTreeNode {
  session_id: string
  parent_session_id: string | null
  spawn_type: string | null
  run_id: string | null
  task_id: string | null
  depth: number
  created_at: string | null
  /** Enriched by the backend when it knows it (same fields as `SessionTreeNode` in `types/chat`). */
  total_cost_usd?: number | null
  cost_basis?: CostBasis | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const discussionsApi = {
  /** Fetch the flat session tree nodes rooted at `sessionId`. */
  getTree: (sessionId: string) =>
    api.get<SessionTreeNode[]>(`/chat/sessions/${sessionId}/tree`),
}
