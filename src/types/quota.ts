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

/**
 * A hold on ONE family of models (`Fable`) — the account still serves on the others. Backend
 * `QuotaView.model_holds`, filtered by the same rule the router applies.
 */
export interface ModelHold {
  model: string
  resets_at_ms: number
  reset_known: boolean
  observed_at_ms: number
}

export interface QuotaView {
  provider_id: string
  windows: QuotaWindow[]
  source: QuotaSource
  observed_at_ms: number
  exhausted: QuotaExhaustion | null
  /** Families out RIGHT NOW; empty (or absent on an older server) when the account serves. */
  model_holds: ModelHold[]
}

/** `GET /api/chat/providers/{id}/quota` — `quota: null` when nothing is known. */
export interface QuotaResponse {
  now_ms: number
  quota: QuotaView | null
}
