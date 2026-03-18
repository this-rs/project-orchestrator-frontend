import { api } from './api'

// ── Types ────────────────────────────────────────────────────────────────

export type RoutingMode = 'nn' | 'full'

export interface NNMetricsSnapshot {
  total_queries: number
  hits: number
  misses: number
  avg_latency_us: number
  p99_latency_us: number
  cache_size: number
  last_invalidated_at: string | null
}

export interface NeuralRoutingStatus {
  enabled: boolean
  mode: RoutingMode
  cpu_guard_paused: boolean
  metrics: NNMetricsSnapshot
}

export interface NeuralRoutingConfig {
  enabled: boolean
  mode: RoutingMode
  inference: {
    timeout_ms: number
    nn_fallback: boolean
  }
  collection: {
    enabled: boolean
    buffer_size: number
    flush_interval_secs: number
  }
  nn: {
    top_k: number
    min_similarity: number
    max_route_age_days: number
  }
}

export interface UpdateConfigRequest {
  enabled?: boolean
  mode?: string
  inference_timeout_ms?: number
  nn_fallback?: boolean
  collection_enabled?: boolean
  collection_buffer_size?: number
  nn_top_k?: number
  nn_min_similarity?: number
  nn_max_route_age_days?: number
}

interface SuccessResponse {
  ok: boolean
  message: string
}

// ── API ──────────────────────────────────────────────────────────────────

export const neuralRoutingApi = {
  getStatus: () =>
    api.get<NeuralRoutingStatus>('/neural-routing/status'),

  getConfig: () =>
    api.get<{ config: NeuralRoutingConfig }>('/neural-routing/config'),

  enable: () =>
    api.post<SuccessResponse>('/neural-routing/enable'),

  disable: () =>
    api.post<SuccessResponse>('/neural-routing/disable'),

  updateConfig: (config: UpdateConfigRequest) =>
    api.put<SuccessResponse>('/neural-routing/config', config),
}
