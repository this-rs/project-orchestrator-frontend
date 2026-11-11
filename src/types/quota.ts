// ============================================================================
// QUOTA — the wire shape of a provider ACCOUNT's quota (QUOTA, backend
// src/chat/provider/quota.rs). Distinct from a configured rate limit
// (rateLimit.ts), which is OUR ceiling: a quota is the provider's own word about
// its account — until when it refuses, and how full its windows are.
// ============================================================================

export type QuotaSource = 'live' | 'manual'
export type QuotaWindowStatus = 'allowed' | 'warning' | 'exhausted'
export type QuotaExhaustionCause = 'window' | 'rate_limited' | 'out_of_credit' | 'manual'

export interface QuotaWindow {
  kind: string
  utilization: number | null
  resets_at_ms: number | null
  status: QuotaWindowStatus
}

export interface QuotaExhaustion {
  resets_at_ms: number
  reset_known: boolean
  window?: string | null
  cause: QuotaExhaustionCause
}

export interface QuotaView {
  provider_id: string
  windows: QuotaWindow[]
  source: QuotaSource
  observed_at_ms: number
  exhausted: QuotaExhaustion | null
}

/** `GET /api/chat/providers/{id}/quota` — `quota: null` when nothing is known. */
export interface QuotaResponse {
  now_ms: number
  quota: QuotaView | null
}
