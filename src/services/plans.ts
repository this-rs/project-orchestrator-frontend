import { api, buildQuery } from './api'
import type {
  Plan,
  PlanDetails,
  Task,
  Constraint,
  DependencyGraph,
  WaveComputationResult,
  PaginatedResponse,
  CreatePlanRequest,
  CreateTaskRequest,
} from '@/types'

interface ListParams {
  limit?: number
  offset?: number
  status?: string
  priority_min?: number
  priority_max?: number
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  /** Filter plans by workspace (all projects in the workspace) */
  workspace_slug?: string
  /** Filter plans by project */
  project_id?: string
}

export const plansApi = {
  // Plans
  list: (params: ListParams = {}) =>
    api.get<PaginatedResponse<Plan>>(`/plans${buildQuery(params)}`),

  get: (planId: string) => api.get<PlanDetails>(`/plans/${planId}`),

  create: (data: CreatePlanRequest) => api.post<Plan>('/plans', data),

  updateStatus: (planId: string, status: string) =>
    api.patch<Plan>(`/plans/${planId}`, { status }),

  delete: (planId: string) => api.delete(`/plans/${planId}`),

  linkToProject: (planId: string, projectId: string) =>
    api.put(`/plans/${planId}/project`, { project_id: projectId }),

  unlinkFromProject: (planId: string) =>
    api.delete(`/plans/${planId}/project`),

  // Dependency graph
  getDependencyGraph: (planId: string) =>
    api.get<DependencyGraph>(`/plans/${planId}/dependency-graph`),

  getCriticalPath: (planId: string) =>
    api.get<{ tasks: Task[]; total_priority: number }>(`/plans/${planId}/critical-path`),

  // Wave computation
  getWaves: (planId: string) =>
    api.get<WaveComputationResult>(`/plans/${planId}/waves`),

  // Tasks in plan
  createTask: (planId: string, data: CreateTaskRequest) =>
    api.post<Task>(`/plans/${planId}/tasks`, data),

  getNextTask: (planId: string) =>
    api.get<Task | null>(`/plans/${planId}/next-task`),

  // Constraints
  listConstraints: (planId: string) =>
    api.get<Constraint[]>(`/plans/${planId}/constraints`),

  addConstraint: (
    planId: string,
    data: { constraint_type: string; description: string; severity?: string }
  ) => api.post<Constraint>(`/plans/${planId}/constraints`, data),

  deleteConstraint: (constraintId: string) =>
    api.delete(`/constraints/${constraintId}`),

  // Commits — backend returns CommitNode[] (flat array with "hash" field)
  getCommits: async (planId: string) => {
    const raw = await api.get<{ hash: string; message: string; author: string; timestamp: string }[]>(
      `/plans/${planId}/commits`
    )
    return { items: (raw || []).map(c => ({ sha: c.hash, message: c.message, author: c.author, timestamp: c.timestamp })) }
  },

  linkCommit: (planId: string, commitSha: string) =>
    api.post(`/plans/${planId}/commits`, { commit_sha: commitSha }),
}
