import { api, buildQuery } from './api'
import type {
  Plan,
  PlanDetails,
  Task,
  Constraint,
  DependencyGraph,
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

  // Commits
  getCommits: (planId: string) =>
    api.get<{ items: { sha: string; message: string; author?: string; timestamp: string }[] }>(
      `/plans/${planId}/commits`
    ),

  linkCommit: (planId: string, commitSha: string) =>
    api.post(`/plans/${planId}/commits`, { commit_sha: commitSha }),
}
