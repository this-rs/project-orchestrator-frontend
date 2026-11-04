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

// ── Shared by the project and the workspace graph loaders ───────────────────

/** How long a snapshot may live on deltas alone before the next load is a full one. */
export const FULL_RELOAD_AFTER_MS = 10 * 60_000

/**
 * The layer groups of a progressive load: the code/fabric core first, then the
 * rest — or one group when only one side is visible. Each group is cached under
 * its own key, so a refresh must load the same groups as the initial load (the
 * mount effect of each loader splits the same way).
 */
export function progressiveGroups(layers: string[]): string[][] {
  const primary = layers.filter((l) => l === 'code' || l === 'fabric')
  const rest = layers.filter((l) => l !== 'code' && l !== 'fabric')
  return primary.length > 0 && rest.length > 0 ? [primary, rest] : [layers]
}

/**
 * Fold an edge list with its deletions, WITHOUT the endpoint check of
 * mergeGraphDelta: cross-project edges join nodes the list itself does not hold.
 */
export function mergeEdgeList(
  base: readonly BackendGraphEdge[],
  delta: readonly BackendGraphEdge[],
  deleted: readonly { source: string; target: string; edge_type: string }[] = [],
): BackendGraphEdge[] {
  const edges = new Map(base.map((e) => [edgeKey(e), e] as const))
  for (const d of deleted) edges.delete(edgeKey({ ...d, type: d.edge_type }))
  for (const e of delta) edges.set(edgeKey(e), e)
  return [...edges.values()]
}

export interface WorkspaceSnapshot<P> extends GraphSnapshot {
  cross_project_edges: BackendGraphEdge[]
  projects: P[]
}

export interface WorkspaceDeltaAnswer<P> extends GraphDeltaAnswer {
  cross_project_edges?: BackendGraphEdge[]
  projects?: P[]
}

/**
 * Fold a workspace delta into a workspace snapshot: nodes and edges as for a
 * project, the cross-project edges as an unchecked list (minus those touching a
 * deleted node), and the project list taken from the delta when it carries one.
 */
export function mergeWorkspaceDelta<P>(base: WorkspaceSnapshot<P>, delta: WorkspaceDeltaAnswer<P>): WorkspaceSnapshot<P> {
  const core = mergeGraphDelta(base, delta)
  const gone = new Set((delta.deleted_nodes ?? []).map((d) => d.id))
  const cross = mergeEdgeList(base.cross_project_edges, delta.cross_project_edges ?? [], delta.deleted_edges ?? []).filter(
    (e) => !gone.has(e.source) && !gone.has(e.target),
  )
  return { ...core, cross_project_edges: cross, projects: delta.projects?.length ? delta.projects : base.projects }
}
