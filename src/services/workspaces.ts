import { api, buildQuery } from './api'
import type {
  Workspace,
  WorkspaceMilestone,
  MilestoneDetail,
  WorkspaceOverview,
  Project,
  Resource,
  Component,
  PaginatedResponse,
  CreateWorkspaceRequest,
  CreateResourceRequest,
  CreateComponentRequest,
  MilestoneProgress,
} from '@/types'

interface ListParams {
  limit?: number
  offset?: number
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export const workspacesApi = {
  // Workspaces
  list: (params: ListParams = {}) =>
    api.get<PaginatedResponse<Workspace>>(`/workspaces${buildQuery(params)}`),

  get: (slug: string) => api.get<Workspace>(`/workspaces/${slug}`),

  create: (data: CreateWorkspaceRequest) =>
    api.post<Workspace>('/workspaces', data),

  update: (slug: string, data: Partial<CreateWorkspaceRequest>) =>
    api.patch<Workspace>(`/workspaces/${slug}`, data),

  delete: (slug: string) => api.delete(`/workspaces/${slug}`),

  getOverview: (slug: string) =>
    api.get<WorkspaceOverview>(`/workspaces/${slug}/overview`),

  // Projects in workspace (backend returns full Project objects as raw array)
  listProjects: (slug: string) =>
    api.get<Project[]>(`/workspaces/${slug}/projects`),

  addProject: (slug: string, projectId: string) =>
    api.post(`/workspaces/${slug}/projects`, { project_id: projectId }),

  removeProject: (slug: string, projectId: string) =>
    api.delete(`/workspaces/${slug}/projects/${projectId}`),

  // Workspace Milestones
  listMilestones: (slug: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<WorkspaceMilestone>>(
      `/workspaces/${slug}/milestones${buildQuery(params)}`
    ),

  createMilestone: (slug: string, data: { title: string; description?: string; target_date?: string; tags?: string[] }) =>
    api.post<WorkspaceMilestone>(`/workspaces/${slug}/milestones`, data),

  getMilestone: (id: string) =>
    api.get<MilestoneDetail>(`/workspace-milestones/${id}`),

  updateMilestone: (id: string, data: Partial<{ title: string; description: string; status: string; target_date: string }>) =>
    api.patch<WorkspaceMilestone>(`/workspace-milestones/${id}`, data),

  deleteMilestone: (id: string) => api.delete(`/workspace-milestones/${id}`),

  addTaskToMilestone: (milestoneId: string, taskId: string) =>
    api.post(`/workspace-milestones/${milestoneId}/tasks`, { task_id: taskId }),

  listMilestoneTasks: (milestoneId: string) =>
    api.get<import('@/types').Task[]>(`/workspace-milestones/${milestoneId}/tasks`),

  removeTaskFromMilestone: (milestoneId: string, taskId: string) =>
    api.delete(`/workspace-milestones/${milestoneId}/tasks/${taskId}`),

  getMilestoneProgress: (id: string) =>
    api.get<MilestoneProgress>(`/workspace-milestones/${id}/progress`),

  // Resources
  listResources: (slug: string, params: { resource_type?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Resource>>(`/workspaces/${slug}/resources${buildQuery(params)}`),

  createResource: (slug: string, data: CreateResourceRequest) =>
    api.post<Resource>(`/workspaces/${slug}/resources`, data),

  getResource: (id: string) => api.get<Resource>(`/resources/${id}`),

  deleteResource: (id: string) => api.delete(`/resources/${id}`),

  linkResourceToProject: (resourceId: string, projectId: string, linkType: 'implements' | 'uses') =>
    api.post(`/resources/${resourceId}/projects`, { project_id: projectId, link_type: linkType }),

  // Components
  listComponents: (slug: string, params: { component_type?: string; limit?: number; offset?: number } = {}) =>
    api.get<PaginatedResponse<Component>>(`/workspaces/${slug}/components${buildQuery(params)}`),

  createComponent: (slug: string, data: CreateComponentRequest) =>
    api.post<Component>(`/workspaces/${slug}/components`, data),

  getComponent: (id: string) => api.get<Component>(`/components/${id}`),

  deleteComponent: (id: string) => api.delete(`/components/${id}`),

  addComponentDependency: (componentId: string, dependsOnId: string, protocol?: string, required = true) =>
    api.post(`/components/${componentId}/dependencies`, {
      depends_on_id: dependsOnId,
      protocol,
      required,
    }),

  removeComponentDependency: (componentId: string, depId: string) =>
    api.delete(`/components/${componentId}/dependencies/${depId}`),

  mapComponentToProject: (componentId: string, projectId: string) =>
    api.put(`/components/${componentId}/project`, { project_id: projectId }),

  getTopology: (slug: string) =>
    api.get<{
      components: Component[]
      dependencies: { from_id: string; to_id: string; protocol?: string; required: boolean }[]
    }>(`/workspaces/${slug}/topology`),
}
