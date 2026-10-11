/**
 * Reading a session's origin off the wire.
 *
 * `spawned_by` reaches the client two ways: typed, on a session record, and
 * untyped, inside a `chat_session` CRUD payload (`Record<string, unknown>`).
 * Both go through {@link readSpawnedBy}, so a payload shaped like nothing we
 * know is `null` rather than a half-read object — and an OLDER BACKEND that
 * sends no `spawned_by` at all is `null` too, which callers must treat as
 * "unknown origin", never as "not my child".
 *
 * Pure and dependency-free: unit-tested against the backend's serde form
 * (`chat::types::SpawnedBy`, `#[serde(tag = "type", rename_all = "snake_case")]`).
 */
import { SPAWNED_BY_TYPES, type SpawnedBy, type SpawnedByType } from '@/types'

const TYPES: ReadonlySet<string> = new Set(SPAWNED_BY_TYPES)

function isSpawnedByType(value: string): value is SpawnedByType {
  return TYPES.has(value)
}

function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function num(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * The origin carried by `value`, or `null` when there is none to read.
 *
 * A variant is kept only when the fields the backend always sends for it are
 * there: a `conversation` without `parent_session_id` is not a parent link, and
 * saying so beats inventing one. Unknown extra fields are dropped; a tag we do
 * not know is `null` (a newer backend variant degrades to "unknown origin").
 */
export function readSpawnedBy(value: unknown): SpawnedBy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const r = value as Record<string, unknown>
  const type = str(r, 'type')
  if (!type || !isSpawnedByType(type)) return null
  const parent = str(r, 'parent_session_id')
  switch (type) {
    case 'runner': {
      const run_id = str(r, 'run_id')
      const task_id = str(r, 'task_id')
      if (!run_id || !task_id) return null
      return { type, run_id, task_id, ...(parent && { parent_session_id: parent }) }
    }
    case 'pipeline': {
      const run_id = str(r, 'run_id')
      const task_id = str(r, 'task_id')
      const wave = num(r, 'wave')
      if (!run_id || !task_id || wave === undefined) return null
      return { type, run_id, task_id, wave, ...(parent && { parent_session_id: parent }) }
    }
    case 'gate': {
      const run_id = str(r, 'run_id')
      const task_id = str(r, 'task_id')
      const gate_name = str(r, 'gate_name')
      const attempt = num(r, 'attempt')
      if (!run_id || !task_id || !gate_name || attempt === undefined) return null
      return { type, run_id, task_id, gate_name, attempt, ...(parent && { parent_session_id: parent }) }
    }
    case 'trigger': {
      const trigger_id = str(r, 'trigger_id')
      if (!trigger_id) return null
      const run_id = str(r, 'run_id')
      const task_id = str(r, 'task_id')
      return { type, trigger_id, ...(run_id && { run_id }), ...(task_id && { task_id }) }
    }
    case 'conversation': {
      if (!parent) return null
      const tool_use_id = str(r, 'tool_use_id')
      return { type, parent_session_id: parent, ...(tool_use_id && { tool_use_id }) }
    }
    case 'delegation': {
      const plan_id = str(r, 'plan_id')
      const task_id = str(r, 'task_id')
      if (!plan_id || !task_id) return null
      const scaffolding_level = num(r, 'scaffolding_level')
      return {
        type,
        plan_id,
        task_id,
        ...(parent && { parent_session_id: parent }),
        ...(scaffolding_level !== undefined && { scaffolding_level }),
      }
    }
  }
}

/** The session that asked for this one, when the origin names one (`trigger` never does). */
export function spawnedByParentId(spawnedBy: SpawnedBy | null | undefined): string | undefined {
  if (!spawnedBy) return undefined
  return spawnedBy.type === 'trigger' ? undefined : spawnedBy.parent_session_id
}

/**
 * The parent's tool-call id, when this session is the child of an `Agent` call.
 * This is the join the sub-agent card uses to find its own child conversation.
 */
export function spawnedByToolUseId(spawnedBy: SpawnedBy | null | undefined): string | undefined {
  return spawnedBy?.type === 'conversation' ? spawnedBy.tool_use_id : undefined
}

/** The plan this session works on, when its origin names one (`delegation` only). */
export function spawnedByPlanId(spawnedBy: SpawnedBy | null | undefined): string | undefined {
  return spawnedBy?.type === 'delegation' ? spawnedBy.plan_id : undefined
}

/** The run this session belongs to, when its origin names one. */
export function spawnedByRunId(spawnedBy: SpawnedBy | null | undefined): string | undefined {
  if (!spawnedBy) return undefined
  switch (spawnedBy.type) {
    case 'runner':
    case 'pipeline':
    case 'gate':
    case 'trigger':
      return spawnedBy.run_id
    default:
      return undefined
  }
}
