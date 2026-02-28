import { api, buildQuery } from './api'
import type {
  Note,
  PaginatedResponse,
  CreateNoteRequest,
  NeuronSearchResponse,
  ReinforceResult,
  DecayResult,
  EnergyUpdateResult,
  PropagatedNote,
  ContextKnowledge,
  PropagatedKnowledge,
} from '@/types'

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
  /** Filter notes by workspace (all projects in the workspace) */
  workspace_slug?: string
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
  confirm: (noteId: string) => api.post<Note>(`/notes/${noteId}/confirm`),

  invalidate: (noteId: string, reason: string) =>
    api.post<Note>(`/notes/${noteId}/invalidate`, { reason }),

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

  // ── Knowledge Fabric ────────────────────────────────────────────────

  // Semantic search (vector cosine similarity)
  // Backend returns flat array: [{ note, score, highlights }]
  searchSemantic: (params: { query: string; project_slug?: string; workspace_slug?: string; limit?: number }) =>
    api.get<{ note: Note; score: number; highlights: string[] | null }[]>(`/notes/search-semantic${buildQuery(params)}`),

  // Neuron search (spreading activation)
  searchNeurons: (params: { query: string; project_slug?: string; max_results?: number; max_hops?: number; min_score?: number }) =>
    api.get<NeuronSearchResponse>(`/notes/neurons/search${buildQuery(params)}`),

  // Reinforce synapses between co-activated notes (min 2 note_ids)
  reinforceNeurons: (data: { note_ids: string[]; energy_boost?: number; synapse_boost?: number }) =>
    api.post<ReinforceResult>('/notes/neurons/reinforce', data),

  // Decay weak synapses
  decaySynapses: (data?: { decay_amount?: number; prune_threshold?: number }) =>
    api.post<DecayResult>('/notes/neurons/decay', data || {}),

  // Recalculate energy scores for all notes
  updateEnergy: (data?: { half_life?: number }) =>
    api.post<EnergyUpdateResult>('/notes/update-energy', data || {}),

  // Propagated notes via graph (IMPORTS, CO_CHANGED, AFFECTS)
  getPropagatedNotes: (params: { entity_type: string; entity_id: string; max_depth?: number; min_score?: number; relation_types?: string }) =>
    api.get<{ items: PropagatedNote[] }>(`/notes/propagated${buildQuery(params)}`),

  // Unified context: notes + decisions + commits for an entity
  getContextKnowledge: (params: { entity_type: string; entity_id: string; max_depth?: number; min_score?: number }) =>
    api.get<ContextKnowledge>(`/notes/context-knowledge${buildQuery(params)}`),

  // Enriched propagated knowledge with relation stats
  getPropagatedKnowledge: (params: { entity_type: string; entity_id: string; max_depth?: number; min_score?: number; relation_types?: string }) =>
    api.get<PropagatedKnowledge>(`/notes/propagated-knowledge${buildQuery(params)}`),

  // Notes directly linked to an entity
  getEntityNotes: (entityType: string, entityId: string) =>
    api.get<{ items: Note[] }>(`/entities/${entityType}/${entityId}/notes`),
}
