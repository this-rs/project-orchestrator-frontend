import { api, buildQuery } from './api'
import type { FeatureGraph, FeatureGraphDetail } from '@/types'

interface ListParams {
  project_id?: string
}

interface ListResponse {
  feature_graphs: FeatureGraph[]
  count: number
}

export const featureGraphsApi = {
  list: (params: ListParams = {}) =>
    api.get<ListResponse>(`/api/feature-graphs${buildQuery(params)}`),

  get: (id: string) => api.get<FeatureGraphDetail>(`/api/feature-graphs/${id}`),

  delete: (id: string) => api.delete(`/api/feature-graphs/${id}`),
}
