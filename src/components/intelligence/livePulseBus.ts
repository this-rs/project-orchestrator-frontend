// ============================================================================
// livePulseBus — "an entity of the graph was just touched", for the renderer
// ============================================================================
//
// useGraphWebSocket is the ONE subscriber of the `/ws/events` socket for the
// intelligence graph. It already applies graph events to the jotai atoms; the
// 3D renderer must not open a second subscription and re-map the same events.
// Instead the hook publishes the ids an event designates on this tiny bus and
// the renderer (useLivePulse) listens — no React state, no re-render: a pulse
// is an imperative write on a vertex, not a change of the graph.
//
// The two pure mappers below say WHICH ids an event designates. They are the
// inventory of the real-time channel as far as entities go:
//
//   graph channel (kind "graph" / "graph_batch", backend GraphEventType):
//     node_created      → node.id          (raw backend id: UUID / path)
//     node_updated      → node_id
//     edge_created      → edge.source, edge.target
//     edge_removed      → source, target
//     reinforcement     → source, target   (Hebbian energy boost)
//     activation        → NOT here: SpreadingActivation owns it (direct /
//                         propagated / done phases, with its own visuals)
//     community_changed → NOT here: up to the whole graph, a recolor not a pulse
//
//   CRUD channel (every other message, backend CrudEvent):
//     {entity_type, action, entity_id, related?, project_id?}
//     → entity_id, and related.entity_id when present, for the entity types
//       that are graph nodes. `attention_changed`, `runner`, `ingestion`,
//       `learning`, `alert`, `trigger`, `lifecycle_hook`, `topology_rule`,
//       `analysis_profile`, `environment`, `deployment` are not nodes of the
//       intelligence graph and are skipped.
// ============================================================================

import type { CrudEvent } from '@/types'

type Listener = (ids: readonly string[]) => void

const listeners = new Set<Listener>()

/** Publish entity ids that were just touched by a real-time event. */
export function emitEntityPulse(ids: readonly string[]): void {
  if (ids.length === 0) return
  for (const l of [...listeners]) l(ids)
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeEntityPulse(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For tests: number of live subscribers. */
export function entityPulseListenerCount(): number {
  return listeners.size
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/** Entity types of the CRUD channel that are (or can be) nodes of the graph. */
export const PULSE_CRUD_ENTITY_TYPES: ReadonlySet<string> = new Set([
  'project', 'plan', 'task', 'step', 'decision', 'constraint', 'commit', 'release',
  'milestone', 'workspace', 'workspace_milestone', 'resource', 'component', 'note',
  'chat_session', 'protocol_run', 'persona', 'skill', 'protocol', 'episode',
  'feature_graph',
])

/** Ids a CRUD event designates on the graph, or [] when it is not about a node. */
export function entityIdsOfCrudEvent(e: CrudEvent): string[] {
  if (!e || typeof e !== 'object') return []
  if (!PULSE_CRUD_ENTITY_TYPES.has(e.entity_type)) return []
  // A deletion has no node to light; a progress tick is not a touch.
  if (e.action === 'deleted') return []
  const ids: string[] = []
  if (typeof e.entity_id === 'string' && e.entity_id.length > 0) ids.push(e.entity_id)
  const rel = e.related
  if (rel && PULSE_CRUD_ENTITY_TYPES.has(rel.entity_type) && typeof rel.entity_id === 'string' && rel.entity_id) {
    ids.push(rel.entity_id)
  }
  return ids
}

/** The frontend-mapped graph events that carry pulsable ids (see useGraphWebSocket). */
export type PulsableGraphEvent =
  | { type: 'graph.node_created'; node: { id: string } }
  | { type: 'graph.node_updated'; node_id: string }
  | { type: 'graph.edge_created'; edge: { source: string; target: string } }
  | { type: 'graph.edge_removed'; source: string; target: string }
  | { type: 'graph.reinforcement'; source: string; target: string }
  | { type: 'graph.activation' }
  | { type: 'graph.community_changed' }

/** Ids a mapped graph event designates, or [] (activation / community are not pulses). */
export function entityIdsOfGraphEvent(e: PulsableGraphEvent): string[] {
  switch (e.type) {
    case 'graph.node_created':
      return e.node.id ? [e.node.id] : []
    case 'graph.node_updated':
      return e.node_id ? [e.node_id] : []
    case 'graph.edge_created':
      return [e.edge.source, e.edge.target].filter(Boolean)
    case 'graph.edge_removed':
    case 'graph.reinforcement':
      return [e.source, e.target].filter(Boolean)
    default:
      return []
  }
}
