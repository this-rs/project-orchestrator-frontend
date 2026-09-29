import { api } from './api'

export type EnvironmentKind = 'dev' | 'staging' | 'production' | 'other'
export type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled_back'

export interface Environment {
  id: string
  project_id: string
  name: string
  kind: EnvironmentKind
  url?: string | null
  description?: string | null
  /** Free-form JSON string (host, region, runtime…). */
  config?: string | null
  created_at: string
}

export interface Deployment {
  id: string
  environment_id: string
  version?: string | null
  commit_sha?: string | null
  status: DeploymentStatus
  notes?: string | null
  created_by: string
  started_at: string
  finished_at?: string | null
}

/** One row of the matrix: an environment and what runs there. */
export interface DeploymentMatrixEntry {
  environment: Environment
  latest_deployment: Deployment | null
  /** Newest first. */
  recent_statuses: DeploymentStatus[]
}

export const environmentsApi = {
  matrix: (projectId: string) =>
    api.get<DeploymentMatrixEntry[]>(`/projects/${projectId}/deployment-matrix`),

  list: (projectId: string) => api.get<Environment[]>(`/projects/${projectId}/environments`),

  listDeployments: (environmentId: string) =>
    api.get<Deployment[]>(`/environments/${environmentId}/deployments`),
}
