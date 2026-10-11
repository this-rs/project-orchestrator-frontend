/**
 * `spawned_by` as the BACKEND writes it (`chat::types::SpawnedBy`, serde tagged
 * on `type`, snake_case). The payloads below are copied from that enum field
 * for field — they are the contract, and a drift in either direction must fail
 * here rather than silently leave a field `undefined` in the UI.
 *
 * Run with: npx vitest run src/utils/spawnedBy.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  readSpawnedBy,
  spawnedByParentId,
  spawnedByPlanId,
  spawnedByRunId,
  spawnedByToolUseId,
} from './spawnedBy'

const PARENT = '11111111-1111-4111-8111-111111111111'
const CHILD_CALL = 'call_abc123'

describe('readSpawnedBy', () => {
  it('reads a sub-conversation WITH its tool_use_id — the join to the parent Agent call', () => {
    const spawnedBy = readSpawnedBy({
      type: 'conversation',
      parent_session_id: PARENT,
      tool_use_id: CHILD_CALL,
    })
    expect(spawnedBy).toEqual({ type: 'conversation', parent_session_id: PARENT, tool_use_id: CHILD_CALL })
    expect(spawnedByToolUseId(spawnedBy)).toBe(CHILD_CALL)
    expect(spawnedByParentId(spawnedBy)).toBe(PARENT)
  })

  it('a sub-conversation opened by a person carries no tool_use_id, and that is not an error', () => {
    const spawnedBy = readSpawnedBy({ type: 'conversation', parent_session_id: PARENT })
    expect(spawnedBy).toEqual({ type: 'conversation', parent_session_id: PARENT })
    expect(spawnedByToolUseId(spawnedBy)).toBeUndefined()
  })

  it('a runner child names its run and its TASK — never a plan (the dead legacy shape)', () => {
    const spawnedBy = readSpawnedBy({
      type: 'runner',
      run_id: 'run-1',
      task_id: 'task-1',
      parent_session_id: PARENT,
    })
    expect(spawnedBy).toEqual({ type: 'runner', run_id: 'run-1', task_id: 'task-1', parent_session_id: PARENT })
    expect(spawnedByRunId(spawnedBy)).toBe('run-1')
    // This is the bug the old frontend type caused: `plan_id` does not exist here.
    expect(spawnedByPlanId(spawnedBy)).toBeUndefined()
    expect(readSpawnedBy({ type: 'runner', run_id: 'run-1', plan_id: 'plan-1' })).toBeNull()
  })

  it('a pipeline child carries its wave', () => {
    expect(readSpawnedBy({ type: 'pipeline', run_id: 'r', task_id: 't', wave: 2 })).toEqual({
      type: 'pipeline',
      run_id: 'r',
      task_id: 't',
      wave: 2,
    })
    // Wave 0 is a real wave, not a missing field.
    expect(readSpawnedBy({ type: 'pipeline', run_id: 'r', task_id: 't', wave: 0 })).toMatchObject({ wave: 0 })
  })

  it('a gate retry is gate_name + attempt (not gate_type + retry_count)', () => {
    expect(
      readSpawnedBy({ type: 'gate', run_id: 'r', task_id: 't', gate_name: 'tests', attempt: 2 }),
    ).toEqual({ type: 'gate', run_id: 'r', task_id: 't', gate_name: 'tests', attempt: 2 })
    expect(readSpawnedBy({ type: 'gate', run_id: 'r', gate_type: 'tests', retry_count: 2 })).toBeNull()
  })

  it('a trigger has a trigger_id and optional run/task, and never a parent', () => {
    const spawnedBy = readSpawnedBy({ type: 'trigger', trigger_id: 'tr-1', run_id: 'r' })
    expect(spawnedBy).toEqual({ type: 'trigger', trigger_id: 'tr-1', run_id: 'r' })
    expect(spawnedByParentId(spawnedBy)).toBeUndefined()
    // `event_type` was never a field of this variant.
    expect(readSpawnedBy({ type: 'trigger', event_type: 'push' })).toBeNull()
  })

  it('a delegation is the ONLY variant that names a plan', () => {
    const spawnedBy = readSpawnedBy({
      type: 'delegation',
      plan_id: 'plan-1',
      task_id: 'task-1',
      parent_session_id: PARENT,
      scaffolding_level: 2,
    })
    expect(spawnedBy).toEqual({
      type: 'delegation',
      plan_id: 'plan-1',
      task_id: 'task-1',
      parent_session_id: PARENT,
      scaffolding_level: 2,
    })
    expect(spawnedByPlanId(spawnedBy)).toBe('plan-1')
    expect(spawnedByRunId(spawnedBy)).toBeUndefined()
  })

  it('says null rather than half-read anything', () => {
    expect(readSpawnedBy(undefined)).toBeNull()
    expect(readSpawnedBy(null)).toBeNull()
    expect(readSpawnedBy('conversation')).toBeNull()
    expect(readSpawnedBy([{ type: 'conversation', parent_session_id: PARENT }])).toBeNull()
    // A variant a newer backend adds degrades to "unknown origin", it does not throw.
    expect(readSpawnedBy({ type: 'telepathy', parent_session_id: PARENT })).toBeNull()
    // A conversation without a parent is not a parent link.
    expect(readSpawnedBy({ type: 'conversation' })).toBeNull()
    expect(readSpawnedBy({ type: 'conversation', parent_session_id: '' })).toBeNull()
  })

  it('drops fields it does not know instead of carrying them through', () => {
    expect(
      readSpawnedBy({ type: 'conversation', parent_session_id: PARENT, tool_use_id: CHILD_CALL, hacked: true }),
    ).toEqual({ type: 'conversation', parent_session_id: PARENT, tool_use_id: CHILD_CALL })
  })

  it('the accessors tolerate null and undefined', () => {
    for (const value of [null, undefined]) {
      expect(spawnedByParentId(value)).toBeUndefined()
      expect(spawnedByToolUseId(value)).toBeUndefined()
      expect(spawnedByPlanId(value)).toBeUndefined()
      expect(spawnedByRunId(value)).toBeUndefined()
    }
  })
})
