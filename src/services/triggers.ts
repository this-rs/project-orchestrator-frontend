/**
 * API service for EventTriggers — persistent event-to-protocol triggers.
 *
 * Backend endpoints:
 *   GET    /api/triggers           — list all triggers
 *   POST   /api/triggers           — create trigger
 *   GET    /api/triggers/stats     — aggregated stats
 *   GET    /api/triggers/:id       — get trigger by id
 *   PUT    /api/triggers/:id       — update trigger
 *   DELETE /api/triggers/:id       — delete trigger
 *   POST   /api/triggers/:id/enable  — enable
 *   POST   /api/triggers/:id/disable — disable
 */

import { api, buildQuery } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventTrigger {
  id: string
  name: string
  protocol_id: string
  entity_type_pattern: string | null
  action_pattern: string | null
  payload_conditions: Record<string, unknown> | null
  cooldown_secs: number
  enabled: boolean
  project_scope: string | null
  created_at: string
  updated_at: string
}

export interface TriggerStats {
  total: number
  enabled: number
  disabled: number
  by_entity_type: { entity_type: string; count: number }[]
}

export interface CreateTriggerRequest {
  name: string
  protocol_id: string
  entity_type_pattern?: string
  action_pattern?: string
  payload_conditions?: Record<string, unknown>
  cooldown_secs?: number
  enabled?: boolean
  project_scope?: string
}

export interface UpdateTriggerRequest {
  name?: string
  enabled?: boolean
  entity_type_pattern?: string | null
  action_pattern?: string | null
  payload_conditions?: Record<string, unknown> | null
  cooldown_secs?: number
  project_scope?: string | null
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const triggersApi = {
  list: (params?: { project_id?: string }) =>
    api.get<EventTrigger[]>(`/event-triggers${buildQuery(params ?? {})}`),

  get: (id: string) =>
    api.get<EventTrigger>(`/event-triggers/${id}`),

  create: (data: CreateTriggerRequest) =>
    api.post<EventTrigger>('/event-triggers', data),

  update: (id: string, data: UpdateTriggerRequest) =>
    api.put<{ ok: boolean }>(`/event-triggers/${id}`, data),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/event-triggers/${id}`),

  enable: (id: string) =>
    api.post<{ ok: boolean; enabled: boolean }>(`/event-triggers/${id}/enable`),

  disable: (id: string) =>
    api.post<{ ok: boolean; enabled: boolean }>(`/event-triggers/${id}/disable`),

  stats: () =>
    api.get<TriggerStats>('/event-triggers/stats'),
}
