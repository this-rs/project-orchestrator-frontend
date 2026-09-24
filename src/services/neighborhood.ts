/**
 * Entity neighborhood (ego-graph) API.
 *
 * `GET /api/graph/neighborhood` returns the sub-graph around one entity —
 * the same neighborhood the agent receives when it works on that entity.
 */
import { api, buildQuery } from './api'

export type NeighborhoodEntityType =
  | 'note'
  | 'decision'
  | 'task'
  | 'plan'
  | 'milestone'
  | 'project'
  | 'file'
  | 'function'
  | 'struct'
  | 'skill'
  | 'persona'
  | 'protocol'
  | 'feature_graph'
  | 'commit'
  | 'chat_session'
  | 'document'

export type NeighborhoodLayer = 'code' | 'knowledge' | 'planning' | 'neural' | 'behavioral'

export const NEIGHBORHOOD_LAYERS: readonly NeighborhoodLayer[] = [
  'code',
  'knowledge',
  'planning',
  'neural',
  'behavioral',
]

export type NeighborhoodDepth = 1 | 2 | 3

export interface NeighborhoodNode {
  id: string
  /** Entity type — usually a {@link NeighborhoodEntityType}, kept open for forward compat. */
  type: string
  label: string
  subtitle?: string
  /** Salience 0..1 */
  weight: number
  /** Hops from the center, 0..3 */
  depth: number
  layer: string
}

export interface NeighborhoodEdge {
  source: string
  target: string
  rel: string
  /** Strength 0..1 */
  weight: number
  layer: string
}

export interface NeighborhoodStats {
  by_type: Record<string, number>
  by_rel: Record<string, number>
  total_before_limit: number
}

export interface NeighborhoodResponse {
  center: { id: string; type: string }
  nodes: NeighborhoodNode[]
  edges: NeighborhoodEdge[]
  truncated: boolean
  stats: NeighborhoodStats
}

export interface NeighborhoodParams {
  entityType: string
  entityId: string
  depth: NeighborhoodDepth
  /** Server-side filter: hide nodes/edges weaker than this (0..1). */
  minWeight: number
  limit?: number
  /** Enabled layers; `undefined` = all layers. */
  layers?: readonly NeighborhoodLayer[]
}

/** Build the query string of the neighborhood endpoint (exported for tests). */
export function neighborhoodQuery(p: NeighborhoodParams): string {
  return buildQuery({
    entity_type: p.entityType,
    entity_id: p.entityId,
    depth: p.depth,
    min_weight: Math.round(Math.min(1, Math.max(0, p.minWeight)) * 100) / 100,
    limit: p.limit,
    layers: p.layers ? p.layers.join(',') : undefined,
  })
}

export const neighborhoodApi = {
  get: (params: NeighborhoodParams, signal?: AbortSignal) =>
    api.get<NeighborhoodResponse>(`/graph/neighborhood${neighborhoodQuery(params)}`, signal),
}
