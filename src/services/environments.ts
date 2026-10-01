import { api, buildQuery } from './api'
import type { PaginatedResponse } from '@/types'

export type EnvironmentKind = 'dev' | 'staging' | 'production' | 'other'
export type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled_back'

export const ENVIRONMENT_KINDS: EnvironmentKind[] = ['dev', 'staging', 'production', 'other']
export const DEPLOYMENT_STATUSES: DeploymentStatus[] = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'rolled_back',
]

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

/**
 * Create / update payloads. Only the fields the server reads: it defaults
 * `kind` to `other` and rejects a name already used in the same project (409).
 * Omit a field rather than sending an empty string.
 */
export interface EnvironmentInput {
  name: string
  kind?: EnvironmentKind
  url?: string
  description?: string
  /** Object or JSON string — the server normalises both. */
  config?: unknown
}

/** Every field optional: a patch only carries what changed. */
export type EnvironmentPatch = Partial<EnvironmentInput>

/** The server defaults `status` to `pending` and `created_by` to `api`. */
export interface DeploymentInput {
  version?: string
  commit_sha?: string
  status?: DeploymentStatus
  notes?: string
  created_by?: string
}

export interface DeploymentPatch {
  status?: DeploymentStatus
  /** ISO 8601. The server sets it itself when a status becomes terminal. */
  finished_at?: string
  notes?: string
}

export const environmentsApi = {
  matrix: (projectId: string) =>
    api.get<DeploymentMatrixEntry[]>(`/projects/${projectId}/deployment-matrix`),

  list: (projectId: string) => api.get<Environment[]>(`/projects/${projectId}/environments`),

  create: (projectId: string, input: EnvironmentInput) =>
    api.post<Environment>(`/projects/${projectId}/environments`, input),

  get: (id: string) => api.get<Environment>(`/environments/${id}`),

  update: (id: string, patch: EnvironmentPatch) =>
    api.patch<Environment>(`/environments/${id}`, patch),

  remove: (id: string) => api.delete<void>(`/environments/${id}`),

  /** Newest first, paginated — the route answers `{items, total, …}`. */
  listDeployments: (environmentId: string, params: { limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Deployment>>(
      `/environments/${environmentId}/deployments${buildQuery(params)}`,
    ),

  deploy: (environmentId: string, input: DeploymentInput) =>
    api.post<Deployment>(`/environments/${environmentId}/deployments`, input),

  updateDeployment: (id: string, patch: DeploymentPatch) =>
    api.patch<Deployment>(`/deployments/${id}`, patch),
}
