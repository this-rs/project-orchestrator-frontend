import { api, buildQuery } from './api'
import type {
  Persona,
  PersonaStatus,
  PersonaSubgraph,
  PersonaMaintainResult,
  PersonaDetectResult,
  CreatePersonaRequest,
  AutoBuildPersonaRequest,
  PaginatedResponse,
} from '@/types'

export const personasApi = {
  // ── CRUD ──────────────────────────────────────────────────────────────

  list: (params: {
    project_id: string
    status?: PersonaStatus
    limit?: number
    offset?: number
  }) => api.get<PaginatedResponse<Persona>>(`/personas${buildQuery(params)}`),

  listGlobal: (params?: { limit?: number; offset?: number }) =>
    api.get<PaginatedResponse<Persona>>(`/personas/global${buildQuery(params ?? {})}`),

  get: (personaId: string) => api.get<Persona>(`/personas/${personaId}`),

  create: (data: CreatePersonaRequest) => api.post<Persona>('/personas', data),

  update: (
    personaId: string,
    data: Partial<{
      name: string
      description: string
      status: PersonaStatus
      complexity_default: string
      timeout_secs: number
      max_cost_usd: number
      model_preference: string
      system_prompt_override: string
      energy: number
      cohesion: number
    }>,
  ) => api.put<Persona>(`/personas/${personaId}`, data),

  delete: (personaId: string) => api.delete(`/personas/${personaId}`),

  // ── Subgraph ────────────────────────────────────────────────────────

  getSubgraph: (personaId: string) =>
    api.get<PersonaSubgraph>(`/personas/${personaId}/subgraph`),

  // ── Activation ──────────────────────────────────────────────────────

  activate: (personaId: string) =>
    api.post<Persona>(`/personas/${personaId}/activate`, {}),

  // ── Relations ───────────────────────────────────────────────────────

  addSkill: (personaId: string, skillId: string, weight?: number) =>
    api.post(`/personas/${personaId}/skills`, { skill_id: skillId, weight: weight ?? 1.0 }),

  removeSkill: (personaId: string, skillId: string) =>
    api.delete(`/personas/${personaId}/skills/${skillId}`),

  addProtocol: (personaId: string, protocolId: string, weight?: number) =>
    api.post(`/personas/${personaId}/protocols`, { protocol_id: protocolId, weight: weight ?? 1.0 }),

  removeProtocol: (personaId: string, protocolId: string) =>
    api.delete(`/personas/${personaId}/protocols/${protocolId}`),

  addFile: (personaId: string, filePath: string, weight?: number) =>
    api.post(`/personas/${personaId}/files`, { file_path: filePath, weight: weight ?? 1.0 }),

  removeFile: (personaId: string, filePath: string) =>
    api.delete(`/personas/${personaId}/files/${encodeURIComponent(filePath)}`),

  addFunction: (personaId: string, functionName: string, weight?: number) =>
    api.post(`/personas/${personaId}/functions`, { function_name: functionName, weight: weight ?? 1.0 }),

  removeFunction: (personaId: string, functionName: string) =>
    api.delete(`/personas/${personaId}/functions/${encodeURIComponent(functionName)}`),

  addNote: (personaId: string, noteId: string, weight?: number) =>
    api.post(`/personas/${personaId}/notes`, { note_id: noteId, weight: weight ?? 1.0 }),

  removeNote: (personaId: string, noteId: string) =>
    api.delete(`/personas/${personaId}/notes/${noteId}`),

  addDecision: (personaId: string, decisionId: string, weight?: number) =>
    api.post(`/personas/${personaId}/decisions`, { decision_id: decisionId, weight: weight ?? 1.0 }),

  removeDecision: (personaId: string, decisionId: string) =>
    api.delete(`/personas/${personaId}/decisions/${decisionId}`),

  addExtends: (personaId: string, parentId: string) =>
    api.post(`/personas/${personaId}/extends`, { parent_id: parentId }),

  removeExtends: (personaId: string, parentId: string) =>
    api.delete(`/personas/${personaId}/extends/${parentId}`),

  // ── File matching ───────────────────────────────────────────────────

  findForFile: (params: { file_path: string; project_id?: string }) =>
    api.get<{ persona_id: string; persona_name: string; weight: number }[]>(
      `/personas/find-for-file${buildQuery(params)}`,
    ),

  // ── Export / Import ─────────────────────────────────────────────────

  exportPersona: (personaId: string, sourceProjectName?: string) =>
    api.get(`/personas/${personaId}/export${buildQuery({ source_project_name: sourceProjectName })}`),

  importPersona: (data: { project_id: string; package: unknown; conflict_strategy?: string }) =>
    api.post('/personas/import', data),

  // ── Auto-build ──────────────────────────────────────────────────────

  autoBuild: (data: AutoBuildPersonaRequest) =>
    api.post<Persona>('/personas/auto-build', data),

  // ── Maintenance ─────────────────────────────────────────────────────

  maintain: (projectId: string) =>
    api.post<PersonaMaintainResult>(`/personas/maintain?project_id=${projectId}`, {}),

  detect: (projectId: string) =>
    api.post<PersonaDetectResult>(`/personas/detect?project_id=${projectId}`, {}),
}
