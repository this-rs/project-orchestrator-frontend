import { api, buildQuery } from './api'
import type {
  IntelligenceSummary,
  ProjectGraphResponse,
  EmbeddingsProjectionResponse,
} from '@/types/intelligence'

// ============================================================================
// INTELLIGENCE GRAPH — API Service
// ============================================================================

export const intelligenceApi = {
  // Summary (layer counts & stats)
  // GET /api/projects/:slug/intelligence/summary
  getSummary: (projectSlug: string) =>
    api.get<IntelligenceSummary>(
      `/projects/${projectSlug}/intelligence/summary`,
    ),

  // Embeddings UMAP 2D/3D projection for VectorSpaceExplorer
  // GET /api/projects/:slug/embeddings/projection?dimensions=2|3
  getEmbeddingsProjection: (projectSlug: string, dimensions: 2 | 3 = 2) => {
    const query = dimensions === 3 ? '?dimensions=3' : ''
    return api.get<EmbeddingsProjectionResponse>(
      `/projects/${projectSlug}/embeddings/projection${query}`,
    )
  },

  // Full graph data for visualization
  // GET /api/projects/:slug/graph?layers=code,knowledge,fabric,neural,skills&limit=5000
  getGraph: (
    projectSlug: string,
    params: {
      layers?: string[]
      limit?: number
      community?: number
    } = {},
  ) => {
    const query = buildQuery({
      layers: params.layers?.join(','),
      limit: params.limit,
      community: params.community,
    })
    return api.get<ProjectGraphResponse>(
      `/projects/${projectSlug}/graph${query}`,
    )
  },
}
