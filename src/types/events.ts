// ============================================================================
// CRUD EVENT TYPES (mirrors backend Rust types)
// ============================================================================

export type EntityType =
  | 'project'
  | 'plan'
  | 'task'
  | 'step'
  | 'decision'
  | 'constraint'
  | 'commit'
  | 'release'
  | 'milestone'
  | 'workspace'
  | 'workspace_milestone'
  | 'resource'
  | 'component'
  | 'note'
  | 'chat_session'
  | 'protocol_run'

export type CrudAction = 'created' | 'updated' | 'deleted' | 'linked' | 'unlinked' | 'progress'

export interface CrudEvent {
  entity_type: EntityType
  action: CrudAction
  entity_id: string
  payload: Record<string, unknown>
  timestamp: string
  project_id?: string
}

export type EventBusStatus = 'connected' | 'disconnected' | 'reconnecting'

// ============================================================================
// GRAPH EVENT TYPES (mirrors backend src/events/graph.rs)
// ============================================================================

/** Intelligence graph layers — matches backend GraphLayer enum */
export type GraphLayer = 'code' | 'knowledge' | 'fabric' | 'neural' | 'skills' | 'behavioral' | 'pm'

/** Graph mutation event types — matches backend GraphEventType enum (snake_case) */
export type GraphEventType =
  | 'node_created'
  | 'node_updated'
  | 'edge_created'
  | 'edge_removed'
  | 'reinforcement'
  | 'activation'
  | 'community_changed'

/**
 * A graph mutation event for real-time visualization.
 * Mirrors backend `GraphEvent` struct from `src/events/graph.rs`.
 *
 * Received via `/ws/events` either as individual events (`kind: "graph"`)
 * or inside batches (`kind: "graph_batch"` → `events: GraphEvent[]`).
 */
export interface GraphEvent {
  /** Always "graph" — distinguishes from CrudEvent in the WS stream */
  kind: 'graph'
  /** The graph event type (snake_case, no "graph." prefix) */
  type: GraphEventType
  /** The intelligence layer this event belongs to */
  layer: GraphLayer
  /** Primary node ID (node events) or source node ID (edge events) */
  node_id?: string
  /** Target node ID (edge events only) */
  target_id?: string
  /** Edge/relation type (e.g. "SYNAPSE", "LINKED_TO", "CO_CHANGED") */
  edge_type?: string
  /** Changed attributes or event-specific data */
  delta: unknown
  /** Project UUID scope (graph events are always project-scoped) */
  project_id: string
  /** ISO 8601 timestamp */
  timestamp: string
}

/** A batch of graph events sent by the backend to reduce WS message frequency */
export interface GraphBatchMessage {
  kind: 'graph_batch'
  events: GraphEvent[]
  count: number
}
