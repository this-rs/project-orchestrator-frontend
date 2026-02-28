import { api, buildQuery } from './api'
import type {
  FeatureGraph,
  FeatureGraphDetail,
  CreateFeatureGraphRequest,
  AutoBuildFeatureGraphRequest,
  AddFeatureGraphEntityRequest,
  AddFeatureGraphEntityResponse,
} from '@/types'

interface ListParams {
  project_id?: string
}

interface ListResponse {
  feature_graphs: FeatureGraph[]
  count: number
}

export const featureGraphsApi = {
  list: (params: ListParams = {}) =>
    api.get<ListResponse>(`/feature-graphs${buildQuery(params)}`),

  get: (id: string) => api.get<FeatureGraphDetail>(`/feature-graphs/${id}`),

  create: (data: CreateFeatureGraphRequest) =>
    api.post<FeatureGraph>('/feature-graphs', data),

  autoBuild: (data: AutoBuildFeatureGraphRequest) =>
    api.post<FeatureGraphDetail>('/feature-graphs/auto-build', data),

  addEntity: (id: string, data: AddFeatureGraphEntityRequest) =>
    api.post<AddFeatureGraphEntityResponse>(`/feature-graphs/${id}/entities`, data),

  delete: (id: string) => api.delete(`/feature-graphs/${id}`),
}
