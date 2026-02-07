import { api, buildQuery } from './api'
import type {
  Task,
  TaskWithPlan,
  TaskDetails,
  Step,
  Decision,
  StepProgress,
  PaginatedResponse,
  UpdateTaskRequest,
} from '@/types'

interface ListParams {
  plan_id?: string
  status?: string
  priority_min?: number
  priority_max?: number
  tags?: string
  assigned_to?: string
  limit?: number
  offset?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export const tasksApi = {
  // Tasks
  list: (params: ListParams = {}) =>
    api.get<PaginatedResponse<TaskWithPlan>>(`/tasks${buildQuery(params)}`),

  get: (taskId: string) => api.get<TaskDetails>(`/tasks/${taskId}`),

  update: (taskId: string, data: UpdateTaskRequest) =>
    api.patch<Task>(`/tasks/${taskId}`, data),

  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),

  // Dependencies
  addDependencies: (taskId: string, dependencyIds: string[]) =>
    api.post(`/tasks/${taskId}/dependencies`, { dependency_ids: dependencyIds }),

  removeDependency: (taskId: string, dependencyId: string) =>
    api.delete(`/tasks/${taskId}/dependencies/${dependencyId}`),

  getBlockers: (taskId: string) =>
    api.get<{ items: Task[] }>(`/tasks/${taskId}/blockers`),

  getBlocking: (taskId: string) =>
    api.get<{ items: Task[] }>(`/tasks/${taskId}/blocking`),

  // Steps
  listSteps: (taskId: string) =>
    api.get<Step[]>(`/tasks/${taskId}/steps`),

  addStep: (taskId: string, data: { description: string; verification?: string }) =>
    api.post<Step>(`/tasks/${taskId}/steps`, data),

  updateStep: (stepId: string, status: string) =>
    api.patch<Step>(`/steps/${stepId}`, { status }),

  deleteStep: (stepId: string) => api.delete(`/steps/${stepId}`),

  getStepProgress: (taskId: string) =>
    api.get<StepProgress>(`/tasks/${taskId}/steps/progress`),

  // Decisions
  addDecision: (
    taskId: string,
    data: {
      description: string
      rationale: string
      alternatives?: string[]
      chosen_option?: string
    }
  ) => api.post<Decision>(`/tasks/${taskId}/decisions`, data),

  // Commits
  getCommits: (taskId: string) =>
    api.get<{ items: { sha: string; message: string; author?: string; timestamp: string }[] }>(
      `/tasks/${taskId}/commits`
    ),

  linkCommit: (taskId: string, commitSha: string) =>
    api.post(`/tasks/${taskId}/commits`, { commit_sha: commitSha }),

  // Context & Prompt (for agent execution)
  getContext: (planId: string, taskId: string) =>
    api.get<{
      task: Task
      steps: Step[]
      constraints: { constraint_type: string; description: string }[]
      decisions: Decision[]
      target_files: {
        path: string
        language: string
        symbols: string[]
        dependent_files: string[]
        dependencies: string[]
      }[]
      similar_code: { path: string; snippet: string; relevance: number }[]
    }>(`/plans/${planId}/tasks/${taskId}/context`),

  getPrompt: (planId: string, taskId: string) =>
    api.get<{ prompt: string }>(`/plans/${planId}/tasks/${taskId}/prompt`),
}
