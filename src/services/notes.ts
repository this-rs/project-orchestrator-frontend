import { api, buildQuery } from './api'
import type { Note, PaginatedResponse, CreateNoteRequest } from '@/types'

interface ListParams {
  project_id?: string
  note_type?: string
  status?: string
  importance?: string
  min_staleness?: number
  max_staleness?: number
  tags?: string
  search?: string
  limit?: number
  offset?: number
}

interface SearchParams {
  query: string
  project_slug?: string
  note_type?: string
  status?: string
  importance?: string
  limit?: number
}

export const notesApi = {
  // Notes
  list: (params: ListParams = {}) =>
    api.get<PaginatedResponse<Note>>(`/notes${buildQuery(params)}`),

  get: (noteId: string) => api.get<Note>(`/notes/${noteId}`),

  create: (data: CreateNoteRequest) => api.post<Note>('/notes', data),

  update: (
    noteId: string,
    data: Partial<{ content: string; importance: string; status: string; tags: string[] }>
  ) => api.patch<Note>(`/notes/${noteId}`, data),

  delete: (noteId: string) => api.delete(`/notes/${noteId}`),

  search: (params: SearchParams) =>
    api.get<{ items: Note[] }>(`/notes/search${buildQuery(params)}`),

  // Review & Staleness
  getNeedsReview: (projectId?: string) =>
    api.get<{ items: Note[] }>(`/notes/needs-review${buildQuery({ project_id: projectId })}`),

  updateStaleness: () => api.post('/notes/update-staleness'),

  // Actions
  confirm: (noteId: string) => api.post(`/notes/${noteId}/confirm`),

  invalidate: (noteId: string, reason: string) =>
    api.post(`/notes/${noteId}/invalidate`, { reason }),

  supersede: (
    noteId: string,
    data: { project_id: string; note_type: string; content: string; importance?: string; tags?: string[] }
  ) => api.post(`/notes/${noteId}/supersede`, data),

  // Links
  linkToEntity: (noteId: string, entityType: string, entityId: string) =>
    api.post(`/notes/${noteId}/links`, { entity_type: entityType, entity_id: entityId }),

  unlinkFromEntity: (noteId: string, entityType: string, entityId: string) =>
    api.delete(`/notes/${noteId}/links/${entityType}/${entityId}`),

  // Context notes (propagated through graph)
  getContextNotes: (
    entityType: string,
    entityId: string,
    params: { max_depth?: number; min_score?: number } = {}
  ) =>
    api.get<{ items: (Note & { relevance_score: number })[] }>(
      `/notes/context${buildQuery({ entity_type: entityType, entity_id: entityId, ...params })}`
    ),

  // Project notes
  getProjectNotes: (projectId: string) =>
    api.get<{ items: Note[] }>(`/projects/${projectId}/notes`),
}
