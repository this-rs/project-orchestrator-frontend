import { api } from './api'

// ── Types ────────────────────────────────────────────────────────────────

export type RoutingMode = 'nn' | 'full'

/** Mirrors `neural_routing_nn::NNMetricsSnapshot` — the backend is the source of truth. */
export interface NNMetricsSnapshot {
  total_queries: number
  /** Queries answered by a known neighbour. */
  hits: number
  /** Queries answered from the in-memory route cache. */
  cache_hits: number
  /** hits / total_queries, as a 0–1 fraction. */
  hit_rate: number
  /** cache_hits / total_queries, as a 0–1 fraction. */
  cache_hit_rate: number
  /** Mean similarity of the neighbours that answered, 0–1. */
  avg_similarity: number
  /** Mean reward of the routes that answered. */
  avg_reward: number
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
    stale_session_timeout_secs: number
  }
  nn: {
    top_k: number
    min_similarity: number
    max_route_age_days: number
    cache_capacity: number
    cache_ttl_secs: number
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
