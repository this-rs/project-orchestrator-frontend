/**
 * Protocol API service — CRUD for protocols, runs, and FSM state machine data.
 */

import { api, buildQuery } from './api'
import type { Protocol, ProtocolRun, RunNode } from '@/types/protocol'

// ---------------------------------------------------------------------------
// List params
// ---------------------------------------------------------------------------

interface ListProtocolsParams {
  project_id: string
  category?: string
  status?: string
  limit?: number
  offset?: number
}

interface ListRunsParams {
  status?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const protocolApi = {
  // --- Protocols ---

  listProtocols: (params: ListProtocolsParams) =>
    api.get<{ items: Protocol[]; total: number }>(`/protocols${buildQuery(params)}`),

  getProtocol: (protocolId: string) =>
    api.get<Protocol>(`/protocols/${protocolId}`),

  // --- Runs ---

  /** List runs for a specific protocol */
  listRuns: (protocolId: string, params: ListRunsParams = {}) =>
    api.get<{ items: ProtocolRun[]; total: number }>(
      `/protocols/${protocolId}/runs${buildQuery(params)}`,
    ),

  getRun: (runId: string) =>
    api.get<ProtocolRun>(`/protocols/runs/${runId}`),

  getRunTree: (runId: string) =>
    api.get<RunNode>(`/protocols/runs/${runId}/tree`),

  getRunChildren: (runId: string) =>
    api.get<ProtocolRun[]>(`/protocols/runs/${runId}/children`),

  /**
   * Fire a transition on a run. The backend body is `FireTransitionBody { trigger }`
   * (protocol_handlers.rs) — sending `{ event }` is rejected with 422.
   */
  triggerEvent: (runId: string, trigger: string) =>
    api.post<ProtocolRun>(`/protocols/runs/${runId}/transition`, { trigger }),

  /** Cancel an active run */
  cancelRun: (runId: string) =>
    api.post<ProtocolRun>(`/protocols/runs/${runId}/cancel`, {}),

  /** Start a new run for a protocol */
  startRun: (protocolId: string, metadata?: Record<string, unknown>) =>
    api.post<ProtocolRun>(`/protocols/${protocolId}/runs`, { metadata }),
}
