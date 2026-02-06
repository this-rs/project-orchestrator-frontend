import { api, buildQuery } from './api'
import type {
  Project,
  Plan,
  Milestone,
  Release,
  ProjectRoadmap,
  PaginatedResponse,
  CreateProjectRequest,
  CreateMilestoneRequest,
  CreateReleaseRequest,
  MilestoneProgress,
} from '@/types'

interface ListParams {
  limit?: number
  offset?: number
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export const projectsApi = {
  // Projects
  list: (params: ListParams = {}) =>
    api.get<PaginatedResponse<Project>>(`/projects${buildQuery(params)}`),

  get: (slug: string) => api.get<Project>(`/projects/${slug}`),

  create: (data: CreateProjectRequest) =>
    api.post<Project>('/projects', data),

  delete: (slug: string) => api.delete(`/projects/${slug}`),

  sync: (slug: string) => api.post(`/projects/${slug}/sync`),

  listPlans: (projectSlug: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Plan>>(`/plans${buildQuery({ ...params, project_slug: projectSlug })}`),

  getRoadmap: (projectId: string) =>
    api.get<ProjectRoadmap>(`/projects/${projectId}/roadmap`),

  // Milestones
  listMilestones: (projectId: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Milestone>>(`/projects/${projectId}/milestones${buildQuery(params)}`),

  createMilestone: (projectId: string, data: CreateMilestoneRequest) =>
    api.post<Milestone>(`/projects/${projectId}/milestones`, data),

  getMilestone: (milestoneId: string) =>
    api.get<Milestone & { tasks: { id: string; title: string; status: string }[] }>(
      `/milestones/${milestoneId}`
    ),

  updateMilestone: (milestoneId: string, data: Partial<{ title: string; description: string; status: string; target_date: string }>) =>
    api.patch<Milestone>(`/milestones/${milestoneId}`, data),

  addTaskToMilestone: (milestoneId: string, taskId: string) =>
    api.post(`/milestones/${milestoneId}/tasks`, { task_id: taskId }),

  getMilestoneProgress: (milestoneId: string) =>
    api.get<MilestoneProgress>(`/milestones/${milestoneId}/progress`),

  // Releases
  listReleases: (projectId: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Release>>(`/projects/${projectId}/releases${buildQuery(params)}`),

  createRelease: (projectId: string, data: CreateReleaseRequest) =>
    api.post<Release>(`/projects/${projectId}/releases`, data),

  getRelease: (releaseId: string) =>
    api.get<Release & { tasks: { id: string; title: string; status: string }[]; commits: { sha: string; message: string }[] }>(
      `/releases/${releaseId}`
    ),

  updateRelease: (releaseId: string, data: Partial<{ title: string; description: string; status: string; target_date: string; released_at: string }>) =>
    api.patch<Release>(`/releases/${releaseId}`, data),

  addTaskToRelease: (releaseId: string, taskId: string) =>
    api.post(`/releases/${releaseId}/tasks`, { task_id: taskId }),

  addCommitToRelease: (releaseId: string, commitSha: string) =>
    api.post(`/releases/${releaseId}/commits`, { commit_sha: commitSha }),
}
