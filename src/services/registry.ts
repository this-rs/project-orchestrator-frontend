import { api, buildQuery } from './api'
import type {
  PublishedSkillSummary,
  PublishedSkill,
  PublishSkillRequest,
  ImportFromRegistryRequest,
  RegistrySearchParams,
  SkillImportResult,
  PaginatedResponse,
} from '@/types'

export const registryApi = {
  // ── Search & Browse ─────────────────────────────────────────────────────

  /** Search published skills in the registry (local + remote if configured). */
  search: (params: RegistrySearchParams = {}) =>
    api.get<PaginatedResponse<PublishedSkillSummary>>(
      `/registry/search${buildQuery(params)}`,
    ),

  /** Get a specific published skill with its full package. */
  get: (id: string) => api.get<PublishedSkill>(`/registry/${id}`),

  // ── Publish ─────────────────────────────────────────────────────────────

  /** Publish a skill to the local registry. */
  publish: (data: PublishSkillRequest) =>
    api.post<PublishedSkillSummary>('/registry/publish', data),

  // ── Import ──────────────────────────────────────────────────────────────

  /** Import a published skill from the registry into a target project. */
  import: (id: string, data: ImportFromRegistryRequest) =>
    api.post<SkillImportResult>(`/registry/${id}/import`, data),
}
