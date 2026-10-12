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
 *          one per event;
 *  3. liveness. The children endpoint returns the backend's `ChatSession`,
 *     which has NO `is_streaming`: a working child carries
 *     `activity: { streaming: true, … }`, a quiet one no `activity` at all.
 *     The fixtures below are shaped like that wire, not like a field the
 *     server never sends.
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
    ...partial,
  }
}

/** What `stamp_activity` puts on a child whose turn is running. */
const STREAMING = { live: true, streaming: true, pending_permissions: 0, monitors: 0, bash_tasks: 0 }

function emit(action: 'created' | 'updated', entityId: string, payload: Record<string, unknown>) {
  const bus = getEventBus() as unknown as { listeners: Set<(e: CrudEvent) => void> }
  for (const l of bus.listeners) {
    l({ entity_type: 'chat_session', action, entity_id: entityId, payload, timestamp: '' } as CrudEvent)
  }
}

function emitCreated(payload: Record<string, unknown>) {
  emit('created', 'child-1', payload)
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

  it('carries mirror_of (P18c): a Claude Code sub-agent\'s mirror is told apart, a normal child is not', () => {
    const mirror = toDetachedRun(
      child({ id: 'm1', mirror_of: 'claude_code', spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL } }),
    )
    expect(mirror).toMatchObject({ mirrorOf: 'claude_code', toolUseId: CALL })
    expect(toDetachedRun(child({ id: 'c0' })).mirrorOf).toBeUndefined()
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

  it('reads liveness from `activity.streaming` — the only field the children endpoint sends', () => {
    expect(toDetachedRun(child({ id: 'c4', activity: STREAMING })).isStreaming).toBe(true)
    // Quiet: the server omits `activity` altogether.
    expect(toDetachedRun(child({ id: 'c5' })).isStreaming).toBe(false)
    // Alive (subprocess up) but between turns: not streaming.
    expect(toDetachedRun(child({ id: 'c6', activity: { ...STREAMING, streaming: false } })).isStreaming).toBe(false)
  })

  it('reads liveness through normalizeActivity: a non-boolean `streaming` is coerced', () => {
    const run = toDetachedRun(child({ id: 'child-1', activity: { ...STREAMING, streaming: 1 as unknown as boolean } }))
    expect(run.isStreaming).toBe(true)
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
        activity: STREAMING,
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

describe('useDetachedRuns liveness of a just-opened child', () => {
  it('a child whose turn started during the debounce shows as streaming (its early `updated` was dropped)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useDetachedRuns(PARENT))
      await act(async () => {})
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      // The backend's order: SPAWNED_BY edge, `created` (no spawned_by), then
      // the turn's `updated {is_streaming: true}` — while the fetch is still
      // debounced, so the child is not in the list and the event finds no run.
      act(() => {
        emitCreated({ id: 'child-1' })
        emit('updated', 'child-1', { is_streaming: true })
      })
      expect(result.current.runs).toEqual([])

      getSessionChildren.mockResolvedValue([
        child({
          id: 'child-1',
          activity: STREAMING,
          spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL },
        }),
      ] as never)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })

      expect(result.current.runs).toHaveLength(1)
      expect(result.current.runs[0].isStreaming).toBe(true)
      expect(result.current.hasActiveRuns).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a child that finishes while the fetch is in flight does not keep its spinner', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    let resolve: (v: DetachedSession[]) => void = () => {}
    getSessionChildren.mockImplementation(() => new Promise((r) => { resolve = r as (v: DetachedSession[]) => void }))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))

    // The server read its live map (streaming) before the turn ended; the
    // `updated {is_streaming: false}` lands after the request left, before
    // the answer — for a child the list does not hold yet.
    act(() => emit('updated', 'child-1', { is_streaming: false }))
    act(() => resolve([child({ id: 'child-1', activity: STREAMING })]))

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].isStreaming).toBe(false)
  })

  it('an update received BEFORE the request left does not override the answer', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    // Older than anything the next fetch will answer: no fetch in flight to attach it to.
    act(() => emit('updated', 'child-1', { is_streaming: false }))
    getSessionChildren.mockResolvedValue([child({ id: 'child-1', activity: STREAMING })] as never)
    act(() => { result.current.refresh() })

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].isStreaming).toBe(true)
  })

  it('a refetch that changed nothing keeps the same array (no re-render of the transcript)', async () => {
    getSessionChildren.mockResolvedValue([child({ id: 'child-1', title: 'Same' })] as never)
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    const before = result.current.runs

    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(result.current.runs).toBe(before)
  })
})

describe('useDetachedRuns: the parent\'s stream settles a native child (no CRUD `updated` on backend main)', () => {
  it('a native child fetched mid-turn shows as finished once the parent receives its Agent tool_result', async () => {
    vi.useFakeTimers()
    try {
      const native = (activity?: typeof STREAMING) =>
        child({
          id: 'child-1',
          ...(activity ? { activity } : {}),
          spawned_by: { type: 'conversation', parent_session_id: PARENT, tool_use_id: CALL },
        })
      getSessionChildren.mockResolvedValue([native(STREAMING)] as never)
      // `settleSignal` as ChatPanel builds it: 0 answered Agent calls, turn streaming.
      const { result, rerender } = renderHook(
        ({ signal }) => useDetachedRuns(PARENT, { settleSignal: signal }),
        { initialProps: { signal: '0:streaming' } },
      )
      await act(async () => {})
      expect(result.current.runs[0].isStreaming).toBe(true)

      // The child answers and is closed. agent_runtime sends NO `updated`
      // event: the only news is the Agent tool_result in the parent's stream.
      getSessionChildren.mockResolvedValue([native()] as never)
      rerender({ signal: '1:streaming' })
      expect(getSessionChildren).toHaveBeenCalledTimes(1) // debounced
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })

      expect(getSessionChildren).toHaveBeenCalledTimes(2)
      expect(result.current.runs[0].isStreaming).toBe(false)
      expect(result.current.hasActiveRuns).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the parent\'s turn ending refetches too; an unchanged signal does not', async () => {
    vi.useFakeTimers()
    try {
      const { rerender } = renderHook(
        ({ signal }) => useDetachedRuns(PARENT, { settleSignal: signal }),
        { initialProps: { signal: '0:streaming' } },
      )
      await act(async () => {})
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      rerender({ signal: '0:streaming' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      rerender({ signal: '0:idle' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(getSessionChildren).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a session change does not add a settle refetch to its own fetch', async () => {
    vi.useFakeTimers()
    try {
      const { rerender } = renderHook(
        ({ id, signal }) => useDetachedRuns(id, { settleSignal: signal }),
        { initialProps: { id: PARENT, signal: '2:idle' } },
      )
      await act(async () => {})
      rerender({ id: 'parent-2', signal: '0:idle' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(getSessionChildren).toHaveBeenCalledTimes(2)
      expect(getSessionChildren).toHaveBeenLastCalledWith('parent-2')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useDetachedRuns in-flight buffer keeps only finishes', () => {
  it('a late `true` landing during the fetch does not override an answer that says finished', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    let resolve: (v: DetachedSession[]) => void = () => {}
    getSessionChildren.mockImplementation(() => new Promise((r) => { resolve = r as (v: DetachedSession[]) => void }))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))

    // `updated(true)` emitted before the child finished, delivered during the
    // fetch; the server's snapshot was taken after the finish.
    act(() => emit('updated', 'child-1', { is_streaming: true }))
    act(() => resolve([child({ id: 'child-1' })]))

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].isStreaming).toBe(false)
  })

  it('a `true` after a buffered `false` (the child started again) lets the answer decide', async () => {
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(1))

    let resolve: (v: DetachedSession[]) => void = () => {}
    getSessionChildren.mockImplementation(() => new Promise((r) => { resolve = r as (v: DetachedSession[]) => void }))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))

    act(() => {
      emit('updated', 'child-1', { is_streaming: false })
      emit('updated', 'child-1', { is_streaming: true })
    })
    act(() => resolve([child({ id: 'child-1', activity: STREAMING })]))

    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    expect(result.current.runs[0].isStreaming).toBe(true)
  })
})

describe('useDetachedRuns `updated` events', () => {
  it('an update that changes nothing keeps the same array; a real change replaces it', async () => {
    getSessionChildren.mockResolvedValue([child({ id: 'child-1', activity: STREAMING, total_cost_usd: 0.5 })] as never)
    const { result } = renderHook(() => useDetachedRuns(PARENT))
    await waitFor(() => expect(result.current.runs).toHaveLength(1))
    const before = result.current.runs

    act(() => emit('updated', 'child-1', { is_streaming: true }))
    act(() => emit('updated', 'child-1', { is_streaming: true, total_cost_usd: 0.5 }))
    expect(result.current.runs).toBe(before)

    act(() => emit('updated', 'child-1', { is_streaming: false, total_cost_usd: 0.7 }))
    expect(result.current.runs).not.toBe(before)
    expect(result.current.runs[0]).toMatchObject({ isStreaming: false, costUsd: 0.7 })
  })
})

describe('useDetachedRuns debounce timer cleanup', () => {
  it('a pending debounced fetch does not fire after unmount', async () => {
    vi.useFakeTimers()
    try {
      const { unmount } = renderHook(() => useDetachedRuns(PARENT))
      await act(async () => {})
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      act(() => emitCreated({ id: 'a' }))
      unmount()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(getSessionChildren).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a pending debounced fetch from the previous session is dropped on a session change', async () => {
    vi.useFakeTimers()
    try {
      const { rerender } = renderHook(
        ({ sessionId }: { sessionId: string | null }) => useDetachedRuns(sessionId),
        { initialProps: { sessionId: 'session-a' } },
      )
      await act(async () => {})
      expect(getSessionChildren).toHaveBeenCalledTimes(1)

      act(() => emitCreated({ id: 'a' }))
      rerender({ sessionId: 'session-b' })
      await act(async () => {})
      // The mount fetch for B, nothing else.
      expect(getSessionChildren).toHaveBeenCalledTimes(2)
      expect(getSessionChildren).toHaveBeenLastCalledWith('session-b')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      // A's debounced fetch never fired.
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

  it('clears the list rather than leaking the OLD session\'s children when the fetch for a NEW session fails', async () => {
    getSessionChildren.mockResolvedValueOnce([child({ id: 'a-child' })] as never)
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) => useDetachedRuns(sessionId),
      { initialProps: { sessionId: 'session-a' } },
    )
    await waitFor(() => expect(result.current.runs.map(r => r.sessionId)).toEqual(['a-child']))

    // User switches to an unrelated session B. Its fetch fails (transient
    // network blip/429/504) — unlike a same-session refetch failure, there is
    // no honest "previous list" to fall back to: A's children are not B's.
    getSessionChildren.mockRejectedValueOnce(new Error('network blip'))
    rerender({ sessionId: 'session-b' })
    await waitFor(() => expect(getSessionChildren).toHaveBeenCalledTimes(2))
    await act(async () => {})

    expect(result.current.runs).toEqual([])
  })
})
