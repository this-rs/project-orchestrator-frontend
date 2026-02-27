import { api, buildQuery } from './api'
import type {
  Skill,
  SkillStatus,
  SkillTriggerPattern,
  SkillMembers,
  SkillHealth,
  SkillActivationResult,
  SkillPackage,
  SkillImportResult,
  CreateSkillRequest,
  ImportSkillRequest,
  PaginatedResponse,
} from '@/types'

export const skillsApi = {
  // ── CRUD ──────────────────────────────────────────────────────────────

  list: (params: {
    project_id: string
    status?: SkillStatus
    limit?: number
    offset?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }) => api.get<PaginatedResponse<Skill>>(`/skills${buildQuery(params)}`),

  get: (skillId: string) => api.get<Skill>(`/skills/${skillId}`),

  create: (data: CreateSkillRequest) => api.post<Skill>('/skills', data),

  update: (
    skillId: string,
    data: Partial<{
      name: string
      description: string
      status: SkillStatus
      tags: string[]
      trigger_patterns: SkillTriggerPattern[]
      context_template: string
      energy: number
      cohesion: number
    }>,
  ) => api.put<Skill>(`/skills/${skillId}`, data),

  delete: (skillId: string) => api.delete(`/skills/${skillId}`),

  // ── Members ───────────────────────────────────────────────────────────

  /** Returns { notes: Note[], decisions: Decision[] } */
  getMembers: (skillId: string) => api.get<SkillMembers>(`/skills/${skillId}/members`),

  addMember: (skillId: string, entityType: 'note' | 'decision', entityId: string) =>
    api.post(`/skills/${skillId}/members`, { entity_type: entityType, entity_id: entityId }),

  removeMember: (skillId: string, entityType: 'note' | 'decision', entityId: string) =>
    api.delete(`/skills/${skillId}/members/${entityType}/${entityId}`),

  // ── Activation ────────────────────────────────────────────────────────

  activate: (skillId: string, query: string) =>
    api.post<SkillActivationResult>(`/skills/${skillId}/activate`, { query }),

  // ── Export / Import ───────────────────────────────────────────────────

  exportSkill: (skillId: string, sourceProjectName?: string) =>
    api.get<SkillPackage>(
      `/skills/${skillId}/export${buildQuery({ source_project_name: sourceProjectName })}`,
    ),

  importSkill: (data: ImportSkillRequest) => api.post<SkillImportResult>('/skills/import', data),

  // ── Health ────────────────────────────────────────────────────────────

  getHealth: (skillId: string) => api.get<SkillHealth>(`/skills/${skillId}/health`),
}
