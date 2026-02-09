// ============================================================================
// CRUD EVENT TYPES (mirrors backend Rust types)
// ============================================================================

export type EntityType =
  | 'project'
  | 'plan'
  | 'task'
  | 'step'
  | 'decision'
  | 'constraint'
  | 'commit'
  | 'release'
  | 'milestone'
  | 'workspace'
  | 'workspace_milestone'
  | 'resource'
  | 'component'
  | 'note'
  | 'chat_session'

export type CrudAction = 'created' | 'updated' | 'deleted' | 'linked' | 'unlinked'

export interface CrudEvent {
  entity_type: EntityType
  action: CrudAction
  entity_id: string
  payload: Record<string, unknown>
  timestamp: string
  project_id?: string
}

export type EventBusStatus = 'connected' | 'disconnected' | 'reconnecting'
