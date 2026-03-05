import { api, buildQuery } from './api'
import type {
  IntelligenceSummary,
  ProjectGraphResponse,
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
