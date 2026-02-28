import { api } from './api'
import type {
  SyncResult,
  WatchStatus,
  BackfillJobStatus,
  MeilisearchStats,
  BackfillDecisionEmbeddingsResult,
  BackfillDiscussedResult,
  BackfillTouchesResult,
  FabricScoresResult,
  BootstrapKnowledgeFabricResult,
  SkillDetectionResult,
  SkillMaintenanceResult,
  MaintenanceLevel,
} from '@/types'

export const adminApi = {
  // ── Sync & Watch ──────────────────────────────────────────────────────

  syncDirectory: (data: { path: string; project_id?: string }) =>
    api.post<SyncResult>('/sync', data),

  getWatchStatus: () => api.get<WatchStatus>('/watch'),

  startWatch: (data: { path: string; project_id?: string }) =>
    api.post<WatchStatus>('/watch', data),

  stopWatch: () => api.delete<WatchStatus>('/watch'),

  // ── Embedding Backfill ────────────────────────────────────────────────

  startBackfillEmbeddings: (data?: { batch_size?: number }) =>
    api.post<BackfillJobStatus>('/admin/backfill-embeddings', data || {}),

  getBackfillEmbeddingsStatus: () =>
    api.get<BackfillJobStatus>('/admin/backfill-embeddings/status'),

  cancelBackfillEmbeddings: () =>
    api.delete<{ message: string }>('/admin/backfill-embeddings'),

  // ── Synapse Backfill ──────────────────────────────────────────────────

  startBackfillSynapses: (data?: {
    batch_size?: number
    min_similarity?: number
    max_neighbors?: number
  }) => api.post<BackfillJobStatus>('/admin/backfill-synapses', data || {}),

  getBackfillSynapsesStatus: () =>
    api.get<BackfillJobStatus>('/admin/backfill-synapses/status'),

  cancelBackfillSynapses: () =>
    api.delete<{ message: string }>('/admin/backfill-synapses'),

  // ── Decision & Discussed Backfill ─────────────────────────────────────

  backfillDecisionEmbeddings: () =>
    api.post<BackfillDecisionEmbeddingsResult>('/admin/backfill-decision-embeddings'),

  backfillDiscussed: () =>
    api.post<BackfillDiscussedResult>('/admin/backfill-discussed'),

  // ── Meilisearch ───────────────────────────────────────────────────────

  getMeilisearchStats: () => api.get<MeilisearchStats>('/meilisearch/stats'),

  deleteMeilisearchOrphans: () =>
    api.delete<{ success: boolean; message: string }>('/meilisearch/orphans'),

  // ── Cleanup ───────────────────────────────────────────────────────────

  cleanupCrossProjectCalls: () =>
    api.post<{ deleted_count: number }>('/admin/cleanup-cross-project-calls'),

  cleanupBuiltinCalls: () =>
    api.post<{ deleted_count: number }>('/admin/cleanup-builtin-calls'),

  migrateCallsConfidence: () =>
    api.post<{ updated_count: number }>('/admin/migrate-calls-confidence'),

  cleanupSyncData: () =>
    api.post<{ deleted_count: number; message: string }>('/admin/cleanup-sync-data'),

  // ── Knowledge Fabric ──────────────────────────────────────────────────

  updateFabricScores: (data: { project_id: string }) =>
    api.post<FabricScoresResult>('/admin/update-fabric-scores', data),

  bootstrapKnowledgeFabric: (data: { project_id: string }) =>
    api.post<BootstrapKnowledgeFabricResult>('/admin/bootstrap-knowledge-fabric', data),

  detectSkills: (projectId: string) =>
    api.post<SkillDetectionResult>('/admin/detect-skills', { project_id: projectId }),

  skillMaintenance: (data: { project_id: string; level: MaintenanceLevel }) =>
    api.post<SkillMaintenanceResult>('/admin/skill-maintenance', data),

  installHooks: (data: { project_id: string; cwd?: string; port?: number }) =>
    api.post('/admin/install-hooks', data),

  // ── Note Admin ────────────────────────────────────────────────────────

  updateStaleness: () => api.post<{ notes_updated: number }>('/notes/update-staleness'),

  updateEnergy: (data?: { half_life?: number }) =>
    api.post<{ notes_updated: number; half_life_days: number }>('/notes/update-energy', data || {}),

  reinforceNeurons: (data: {
    note_ids: string[]
    energy_boost?: number
    synapse_boost?: number
  }) =>
    api.post<{
      neurons_boosted: number
      synapses_reinforced: number
      energy_boost: number
      synapse_boost: number
    }>('/notes/neurons/reinforce', data),

  decayNeurons: (data?: { decay_amount?: number; prune_threshold?: number }) =>
    api.post<{
      synapses_decayed: number
      synapses_pruned: number
      decay_amount: number
      prune_threshold: number
    }>('/notes/neurons/decay', data || {}),

  // ── Touches Backfill ──────────────────────────────────────────────────

  backfillTouches: (projectSlug: string) =>
    api.post<BackfillTouchesResult>(`/projects/${projectSlug}/backfill-touches`),
}
