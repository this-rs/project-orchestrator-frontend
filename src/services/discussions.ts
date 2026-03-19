/**
 * Discussions service — fetches the discussion tree for a chat session.
 *
 * GET /api/chat/sessions/{sessionId}/tree -> DiscussionNode
 */

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
}

export interface DiscussionNode {
  session_id: string
  title: string | null
  status: 'streaming' | 'completed' | 'failed' | 'idle'
  cost_usd: number
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
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const discussionsApi = {
  /** Fetch the flat session tree nodes rooted at `sessionId`. */
  getTree: (sessionId: string) =>
    api.get<SessionTreeNode[]>(`/chat/sessions/${sessionId}/tree`),
}
