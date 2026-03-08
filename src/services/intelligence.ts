import { api, buildQuery } from './api'
import type {
  IntelligenceSummary,
  ProjectGraphResponse,
  WorkspaceGraphResponse,
  WorkspaceIntelligenceSummary,
  EmbeddingsProjectionResponse,
  ProtocolDetailApi,
  ProtocolRunApi,
  RouteResponse,
  ComposeProtocolRequest,
  ComposeResponse,
  SimulateRequest,
  SimulateResponse,
} from '@/types/intelligence'
import type { PaginatedResponse } from '@/types'

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

  // List protocols for a project
  // GET /api/protocols?project_id=...
  listProtocols: (projectId: string) => {
    const query = buildQuery({ project_id: projectId })
    return api.get<PaginatedResponse<{ id: string; name: string; protocol_category: string }>>(
      `/protocols${query}`,
    )
  },

  // Protocol detail (with states + transitions)
  // GET /api/protocols/:protocolId
  getProtocol: (protocolId: string) =>
    api.get<ProtocolDetailApi>(`/protocols/${protocolId}`),

  // Protocol runs
  // GET /api/protocols/:protocolId/runs?status=running
  listRuns: (protocolId: string, status?: string) => {
    const query = buildQuery({ status })
    return api.get<PaginatedResponse<ProtocolRunApi>>(
      `/protocols/${protocolId}/runs${query}`,
    )
  },

  // GET /api/protocols/runs/:runId
  getRun: (runId: string) =>
    api.get<ProtocolRunApi>(`/protocols/runs/${runId}`),

  // Route protocols by context affinity
  // GET /api/protocols/route?project_id=...&plan_id=...&phase=...&domain=...&resource=...
  routeProtocols: (params: {
    project_id?: string
    plan_id?: string
    phase?: number
    domain?: number
    resource?: number
  } = {}) => {
    const query = buildQuery(params)
    return api.get<RouteResponse>(`/protocols/route${query}`)
  },

  // Compose a protocol (one-shot: Skill + Protocol + States + Transitions + Note links)
  // POST /api/protocols/compose
  composeProtocol: (data: ComposeProtocolRequest) =>
    api.post<ComposeResponse>('/protocols/compose', data),

  // Simulate protocol activation (dry-run routing)
  // POST /api/protocols/simulate
  simulateProtocol: (data: SimulateRequest) =>
    api.post<SimulateResponse>('/protocols/simulate', data),

  // Full graph data for visualization
  // GET /api/projects/:slug/graph?layers=code,knowledge,fabric,neural,skills,behavioral&limit=5000
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

  // ---- Workspace-level endpoints (aggregated multi-project) ----

  // Workspace graph (aggregated across all workspace projects)
  // GET /api/workspaces/:slug/graph?layers=code,knowledge&limit=5000
  getWorkspaceGraph: (
    workspaceSlug: string,
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
    return api.get<WorkspaceGraphResponse>(
      `/workspaces/${workspaceSlug}/graph${query}`,
    )
  },

  // Workspace intelligence summary (aggregated across all workspace projects)
  // GET /api/workspaces/:slug/intelligence/summary
  getWorkspaceSummary: (workspaceSlug: string) =>
    api.get<WorkspaceIntelligenceSummary>(
      `/workspaces/${workspaceSlug}/intelligence/summary`,
    ),
}
