/**
 * `useActiveRunTracker`: the "Active runs · N runs in progress" counter of
 * SessionList, fed by CRUD events only.
 *
 * The backend names the parent on `created` only (`spawned_by`), and keeps
 * `updated` minimal: `{ is_streaming }`, never `spawned_by`. The tracker used
 * to need `spawned_by` on BOTH, so once `created` carried it the count went up
 * per child and never came down. These tests send the events shaped like the
 * wire: the finish of a child is found by its own id.
 *
 * Run with: npx vitest run src/hooks/__tests__/useActiveRunTracker.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getEventBus } from '@/services'
import type { CrudAction, CrudEvent } from '@/types'
import { readSpawnedBy, spawnedByParentId } from '@/utils/spawnedBy'
import { ACTIVE_RUN_TRACKER_CAPACITY, useActiveRunTracker } from '../useDetachedRuns'

const PARENT = 'parent-1'
const CHILD = 'child-1'

/** Exactly what the backend's `created` will carry for a child (no tool_use_id). */
const CREATED_PAYLOAD = {
  project_slug: 'demo',
  spawned_by: { type: 'conversation', parent_session_id: PARENT },
}

function emit(action: CrudAction, entityId: string, payload: Record<string, unknown>) {
  const bus = getEventBus() as unknown as { listeners: Set<(e: CrudEvent) => void> }
  act(() => {
    for (const l of bus.listeners) {
      l({ entity_type: 'chat_session', action, entity_id: entityId, payload, timestamp: '' } as CrudEvent)
    }
  })
}

const created = (id: string, payload: Record<string, unknown> = CREATED_PAYLOAD) => emit('created', id, payload)
const streaming = (id: string, is_streaming: boolean) => emit('updated', id, { is_streaming })

function mount() {
  return renderHook(() => useActiveRunTracker())
}

describe('useActiveRunTracker', () => {
  it('reads the exact backend `created` payload as a conversation child of the parent', () => {
    const spawnedBy = readSpawnedBy(CREATED_PAYLOAD.spawned_by)
    expect(spawnedBy).toEqual({ type: 'conversation', parent_session_id: PARENT })
    expect(spawnedByParentId(spawnedBy)).toBe(PARENT)
  })

  it('counts a created child under its parent', () => {
    const { result } = mount()
    created(CHILD)
    expect(result.current.get(PARENT)).toEqual({ runCount: 1, hasStreaming: true })
  })

  it('an `updated {is_streaming:false}` without spawned_by ends the child and removes the parent entry', () => {
    const { result } = mount()
    created(CHILD)
    streaming(CHILD, false)
    expect(result.current.has(PARENT)).toBe(false)
    expect(result.current.size).toBe(0)
  })

  it('a child running several turns never goes negative and ends at 0', () => {
    const { result } = mount()
    created(CHILD)
    created('child-2')
    expect(result.current.get(PARENT)?.runCount).toBe(2)

    streaming(CHILD, false)
    expect(result.current.get(PARENT)?.runCount).toBe(1)
    streaming(CHILD, false) // a repeated finish does not decrement twice
    expect(result.current.get(PARENT)?.runCount).toBe(1)
    streaming(CHILD, true) // a new turn: active again
    expect(result.current.get(PARENT)?.runCount).toBe(2)
    streaming(CHILD, false)
    expect(result.current.get(PARENT)?.runCount).toBe(1)

    streaming('child-2', false)
    expect(result.current.has(PARENT)).toBe(false)
  })

  it('a second `created` for the same child (provider switch) still counts once', () => {
    const { result } = mount()
    created(CHILD)
    created(CHILD)
    expect(result.current.get(PARENT)?.runCount).toBe(1)
    streaming(CHILD, false)
    expect(result.current.size).toBe(0)
  })

  it('an `updated` for an untracked id changes nothing', () => {
    const { result } = mount()
    created(CHILD)
    const before = result.current
    streaming('someone-else', false)
    streaming('someone-else', true)
    expect(result.current).toBe(before)
    expect(result.current.get(PARENT)?.runCount).toBe(1)
  })

  it('ignores a `created` without a readable parent', () => {
    const { result } = mount()
    created('plain', { project_slug: 'demo' })
    created('trigger', { spawned_by: { type: 'trigger', trigger_id: 'tr-1' } })
    created('broken', { spawned_by: { type: 'conversation' } })
    expect(result.current.size).toBe(0)
    // and their later updates are untracked too
    streaming('plain', true)
    expect(result.current.size).toBe(0)
  })

  it('a deleted child is dropped', () => {
    const { result } = mount()
    created(CHILD)
    emit('deleted', CHILD, {})
    expect(result.current.size).toBe(0)
    streaming(CHILD, true)
    expect(result.current.size).toBe(0)
  })

  it('bounds its memory: finished children are forgotten first past the capacity', () => {
    const { result } = mount()
    created('finished')
    streaming('finished', false)
    created('running')
    for (let i = 0; i < ACTIVE_RUN_TRACKER_CAPACITY - 1; i++) created(`filler-${i}`)
    // `finished` was evicted to make room; `running` is still counted.
    streaming('finished', true)
    expect(result.current.get(PARENT)?.runCount).toBe(ACTIVE_RUN_TRACKER_CAPACITY)
    streaming('running', false)
    expect(result.current.get(PARENT)?.runCount).toBe(ACTIVE_RUN_TRACKER_CAPACITY - 1)
  })
})
