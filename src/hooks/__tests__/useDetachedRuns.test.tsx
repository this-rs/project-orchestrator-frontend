/**
 * `useDetachedRuns`: the children of the open session, and how they stay up to
 * date live.
 *
 * Several things are pinned here:
 *
 *  1. the mapping of `spawned_by` onto a run — `toolUseId` (the join to the
 *     parent's `Agent` tool call) and `planId`, which the old type read off a
 *     `runner` origin that has no `plan_id` at all, so it was always undefined;
 *  2. the CRUD "created" path, WITH and WITHOUT `spawned_by` in the payload.
 *     Today's backend sends neither — `manager.rs:6899-6911` and
 *     `chat_handlers.rs:173-183` carry no `spawned_by` at all — so the
 *     fallback fetch fires for every session created anywhere, and the hook
 *     must survive that without corrupting its own state:
 *       a. a STALE response landing after a newer one must not overwrite it
 *          (`requestIdRef` generation guard);
 *       b. a FAILED fetch must keep the previous list, not blank it;
 *       c. a BURST of unrelated creations must coalesce into one fetch, not
 *          one per event.
 *
 * Run with: npx vitest run src/hooks/__tests__/useDetachedRuns.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { getEventBus } from '@/services'
import { chatApi } from '@/services/chat'
import type { CrudEvent, DetachedSession } from '@/types'
import { useDetachedRuns, toDetachedRun } from '../useDetachedRuns'

const PARENT = 'parent-1'
const CALL = 'call_subagent_1'

function child(partial: Partial<DetachedSession> & { id: string }): DetachedSession {
  return {
    model: 'deepseek-chat',
    created_at: '2026-10-11T10:00:00Z',
    updated_at: '2026-10-11T10:00:01Z',
    is_streaming: false,
    ...partial,
  }
}

function emitCreated(payload: Record<string, unknown>) {
  const bus = getEventBus() as unknown as { listeners: Set<(e: CrudEvent) => void> }
  for (const l of bus.listeners) {
    l({ entity_type: 'chat_session', action: 'created', entity_id: 'child-1', payload, timestamp: '' } as CrudEvent)
  }
}

let getSessionChildren: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  getSessionChildren = vi.spyOn(chatApi, 'getSessionChildren')
  getSessionChildren.mockReset()
  getSessionChildren.mockResolvedValue([])
})

describe('toDetachedRun', () => {
  it('keeps the tool_use_id of a sub-agent child: that is how its card finds it', () => {
    const run = toDetachedRun(
      child({
        id: 'child-1',
        title: 'Audit the spawn path',
        spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL },
      }),
    )
    expect(run.toolUseId).toBe(CALL)
    expect(run.planId).toBeUndefined()
    expect(run.runId).toBeUndefined()
  })

  it('reads a runner child as run + task, and a delegation as the plan', () => {
    const runner = toDetachedRun(child({ id: 'c1', spawned_by: { type: 'runner', run_id: 'r1', task_id: 't1' } }))
    expect(runner).toMatchObject({ runId: 'r1', taskId: 't1' })
    expect(runner.planId).toBeUndefined()

    const delegated = toDetachedRun(
      child({ id: 'c2', spawned_by: { type: 'delegation', plan_id: 'p1', task_id: 't2' } }),
    )
    expect(delegated).toMatchObject({ planId: 'p1', taskId: 't2' })
    expect(delegated.runId).toBeUndefined()
  })

  it('a child with no origin on the wire is still a run, with no origin fields', () => {
    const run = toDetachedRun(child({ id: 'c3' }))
    expect(run.sessionId).toBe('c3')
    expect(run.title).toBe('Run c3')
    expect(run.toolUseId).toBeUndefined()
    expect(run.planId).toBeUndefined()
  })
})

describe('useDetachedRuns live "created" path', () => {
  it('re-fetches when the payload names our session as the parent', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    getSessionChildren.mockResolvedValue([
      child({
        id: 'child-1',
        title: 'Audit the spawn path',
        is_streaming: true,
        spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL },
      }),
    ] as never)
    act(() => emitCreated({ id: 'child-1', spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL } }))

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].toolUseId).toBe(CALL)
    expect(result.current.hasActiveRuns).toBe(true)
  })

  it('still re-fetches when the payload carries NO spawned_by (older backend)', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    getSessionChildren.mockResolvedValue([
      child({
        id: 'child-1',
        title: 'Audit the spawn path',
        spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL },
      }),
    ] as never)
    // The whole payload of a server that does not send the field yet.
    act(() => emitCreated({ id: 'child-1', model: 'deepseek-chat' }))

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].toolUseId).toBe(CALL)
  })

  it('ignores a created child that belongs to ANOTHER session', async () => {
    renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    act(() => emitCreated({ id: 'x', spawned_by: { type: 'conversation', parent_session_id: 'someone-else' } }))
    await act(async () => {})
    expect(getSessionChildren).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of unrelated creations into a single trailing fetch', async () => {
    vi.useFakeTimers()
    try {
      renderHook(() => useDetachedRuns(PARENT))
      await act(async () => {})
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      // A pipeline wave opening several sessions elsewhere, none of them ours
      // (today's backend sends no `spawned_by`, so every one of these takes
      // the fallback path).
      act(() => {
        emitCreated({ id: 'a' })
        emitCreated({ id: 'b' })
        emitCreated({ id: 'c' })
      })
      // Still debounced — no extra fetch has fired yet.
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      // One trailing fetch for the whole burst, not three.
      expect(getSessionChildren).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useDetachedRuns fetch robustness', () => {
  it('a stale response cannot overwrite a newer one (last SENT wins, not last to LAND)', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    const deferred: Array<(v: DetachedSession[]) => void> = []
    getSessionChildren.mockImplementation(
      () => new Promise(resolve => { deferred.push(resolve as (v: DetachedSession[]) => void) }),
    )

    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(3))

    // deferred[0] is the OLDER of the two in-flight requests (index 1 overall,
    // after the initial mount fetch), deferred[1] is the NEWER. Resolve the
    // newer one first, then the older one landing late — the older must lose.
    act(() => { deferred[1]([child({ id: 'newer' })] as never) })
    await waitFor(() => expect(result.current.runs.map(r => r.sessionId)).toEqual(['newer']))

    act(() => { deferred[0]([child({ id: 'older' })] as never) })
    await act(async () => {})
    expect(result.current.runs.map(r => r.sessionId)).toEqual(['newer'])
  })

  it('keeps the previous list when a fetch fails, instead of blanking it', async () => {
    getSessionChildren.mockResolvedValueOnce([child({ id: 'existing' })] as never)
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(result.current.runs.map(r => r.sessionId)).toEqual(['existing']))

    getSessionChildren.mockRejectedValueOnce(new Error('network blip'))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))
    await act(async () => {})

    expect(result.current.runs.map(r => r.sessionId)).toEqual(['existing'])
  })
})
