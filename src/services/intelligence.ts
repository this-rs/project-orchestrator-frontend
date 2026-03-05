import { api, buildQuery } from './api'
import type {
  IntelligenceSummary,
  IntelligenceRelationType,
} from '@/types/intelligence'

// ============================================================================
// INTELLIGENCE GRAPH — API Service
// ============================================================================

// ── Response types (graph endpoint) ──────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  entityType: string
  layer: string
  properties: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relationType: IntelligenceRelationType
  layer: string
  weight?: number
  confidence?: number
}

export interface IntelligenceGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── API ──────────────────────────────────────────────────────────────────────

export const intelligenceApi = {
  // Summary (layer counts & stats)
  getSummary: (projectSlug: string) =>
    api.get<IntelligenceSummary>(
      `/projects/${projectSlug}/intelligence/summary`,
    ),

  // Full graph data for visualization
  getGraph: (
    projectSlug: string,
    params: {
      layers?: string[]
      limit?: number
      include_edges?: boolean
    } = {},
  ) => {
    const query = buildQuery({
      layers: params.layers?.join(','),
      limit: params.limit,
      include_edges: params.include_edges,
    })
    return api.get<IntelligenceGraphResponse>(
      `/projects/${projectSlug}/intelligence/graph${query}`,
    )
  },

  // Subgraph focused on a specific node
  getNodeNeighborhood: (
    projectSlug: string,
    params: { node_id: string; depth?: number; layers?: string[] },
  ) => {
    const query = buildQuery({
      node_id: params.node_id,
      depth: params.depth,
      layers: params.layers?.join(','),
    })
    return api.get<IntelligenceGraphResponse>(
      `/projects/${projectSlug}/intelligence/neighborhood${query}`,
    )
  },
}
