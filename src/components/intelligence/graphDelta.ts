// ============================================================================
// graphDelta — apply an incremental graph reload to a snapshot in memory
// ============================================================================
//
// The backend answers `since=<synced_at>&include_deleted=1` with only what
// changed since that cursor: the nodes touched since, the edges touching them,
// and what disappeared. This module folds that answer into the snapshot we
// already hold, so a refresh costs what changed, not the whole graph.
//
// Known limits, from the backend contract (graph_sync.rs): an edge created
// between two unchanged nodes only arrives with a full reload, and deletions
// are reliable only when the answer says `deletions_tracked !== false`. The
// caller must fall back to a full load in that case; this module does not guess.
// ============================================================================

import type { BackendGraphEdge, BackendGraphNode } from '@/types/intelligence'

export interface GraphSnapshot {
  nodes: BackendGraphNode[]
  edges: BackendGraphEdge[]
}

export interface GraphDeltaAnswer extends GraphSnapshot {
  deleted_nodes?: { id: string }[]
  deleted_edges?: { source: string; target: string; edge_type: string }[]
}

/** Identity of an edge, as the backend keys it: endpoints plus relation type. */
export function edgeKey(e: { source: string; target: string; type: string }): string {
  return `${e.source}\u0001${e.target}\u0001${e.type}`
}

/**
 * Fold `delta` into `base`. Deletions go first, then upserts, so a node that
 * vanished and came back with the same id is kept at its newest state. An edge
 * whose endpoint is no longer in the graph is dropped with it.
 */
export function mergeGraphDelta(base: GraphSnapshot, delta: GraphDeltaAnswer): GraphSnapshot {
  const nodes = new Map(base.nodes.map((n) => [n.id, n] as const))
  for (const d of delta.deleted_nodes ?? []) nodes.delete(d.id)
  for (const n of delta.nodes) nodes.set(n.id, n)

  const edges = new Map(base.edges.map((e) => [edgeKey(e), e] as const))
  for (const d of delta.deleted_edges ?? []) edges.delete(edgeKey({ ...d, type: d.edge_type }))
  for (const e of delta.edges) edges.set(edgeKey(e), e)

  const kept = [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target))
  return { nodes: [...nodes.values()], edges: kept }
}
