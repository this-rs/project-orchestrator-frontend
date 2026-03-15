import { api, buildQuery } from './api'
import type {
  SharingStatusResponse,
  SharingPolicy,
  SharingEvent,
  SharingPreviewItem,
  SharingSuggestionItem,
  SignedTombstone,
  PrivacyReportResponse,
  PolicyUpdateRequest,
  RetractRequest,
  ConsentUpdateRequest,
} from '@/types'

export const sharingApi = {
  // ── Status ────────────────────────────────────────────────────────────

  getStatus: (slug: string) =>
    api.get<SharingStatusResponse>(`/projects/${slug}/sharing`),

  enable: (slug: string) =>
    api.post<SharingStatusResponse>(`/projects/${slug}/sharing/enable`),

  disable: (slug: string) =>
    api.post<SharingStatusResponse>(`/projects/${slug}/sharing/disable`),

  // ── Policy ────────────────────────────────────────────────────────────

  getPolicy: (slug: string) =>
    api.get<SharingPolicy>(`/projects/${slug}/sharing/policy`),

  setPolicy: (slug: string, body: PolicyUpdateRequest) =>
    api.put<SharingPolicy>(`/projects/${slug}/sharing/policy`, body),

  // ── Consent ───────────────────────────────────────────────────────────

  setConsent: (noteId: string, body: ConsentUpdateRequest) =>
    api.put<{ note_id: string; consent: string; updated: boolean }>(
      `/notes/${noteId}/sharing/consent`,
      body,
    ),

  // ── History ───────────────────────────────────────────────────────────

  getHistory: (slug: string, params?: { limit?: number; offset?: number }) =>
    api.get<SharingEvent[]>(`/projects/${slug}/sharing/history${params ? buildQuery(params) : ''}`),

  // ── Preview & Suggest ─────────────────────────────────────────────────

  preview: (slug: string) =>
    api.get<SharingPreviewItem[]>(`/projects/${slug}/sharing/preview`),

  suggest: (slug: string) =>
    api.get<SharingSuggestionItem[]>(`/projects/${slug}/sharing/suggest`),

  // ── Retract ───────────────────────────────────────────────────────────

  retract: (slug: string, body: RetractRequest) =>
    api.post<{ retracted: boolean; content_hash: string; tombstone_persisted: boolean; event_recorded: boolean }>(
      `/projects/${slug}/sharing/retract`,
      body,
    ),

  // ── Tombstones ────────────────────────────────────────────────────────

  listTombstones: (slug: string) =>
    api.get<SignedTombstone[]>(`/projects/${slug}/sharing/tombstones`),

  // ── Report ────────────────────────────────────────────────────────────

  getLastReport: (slug: string) =>
    api.get<PrivacyReportResponse>(`/projects/${slug}/sharing/last-report`),
}
