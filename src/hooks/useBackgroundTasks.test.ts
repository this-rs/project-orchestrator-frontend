/**
 * Unit tests for `useBackgroundTasks` (F2 of plan 5985a7c4).
 *
 * The hook is a thin Jotai read + service wrapper, so the tests focus
 * on the contract surface:
 * - Reads the atom value (snapshot reactivity).
 * - Updates after a write to the atom (mimics WS dispatch).
 * - `cancelTask` POSTs to the right endpoint with the right id.
 * - `cancelTask` throws when no session is active (defensive guard).
 * - Surfaces `capped: true` in the result without throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import { chatBackgroundTasksAtom, chatSessionIdAtom } from '@/atoms'
import { authModeAtom, authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'
import type { BackgroundTaskInfo, CancelTaskResult } from '@/types'

// Mock the chat service before importing the hook so the spy lands on
// the actual reference used by the hook.
vi.mock('@/services/chat', () => {
  return {
    chatApi: {
      cancelTask: vi.fn<
        (sessionId: string, taskId: string, beforeSend: (token: string | null) => boolean) => Promise<CancelTaskResult>
      >(),
    },
  }
})

vi.mock('@/services/auth', () => ({ getAuthMode: vi.fn(() => 'required') }))

import { getAuthMode } from '@/services/auth'
import { chatApi } from '@/services/chat'
import { useBackgroundTasks } from './useBackgroundTasks'
import { ApiError } from '@/services/api'
import { CancelFailedError } from '@/utils/cancelFailure'

function withStore(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children)
}

const sampleTask: BackgroundTaskInfo = {
  id: 'toolu_01ABC',
  kind: 'monitor',
  description: 'tail -F /tmp/build.log',
  started_at: '2026-05-01T10:00:00Z',
  last_seen_at: '2026-05-01T10:00:05Z',
  pid: null,
  parent_tool_use_id: 'toolu_01ABC',
}

describe('useBackgroundTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the empty snapshot by default', () => {
    const store = createStore()
    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })
    expect(result.current.tasks).toEqual([])
  })

  it('reflects atom updates (mimics WS dispatch)', () => {
    const store = createStore()
    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })

    act(() => {
      store.set(chatBackgroundTasksAtom, [sampleTask])
    })

    expect(result.current.tasks).toEqual([sampleTask])
    expect(result.current.tasks[0].kind).toBe('monitor')
  })

  it('clears when the atom is reset to []', () => {
    const store = createStore()
    store.set(chatBackgroundTasksAtom, [sampleTask])

    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })
    expect(result.current.tasks).toHaveLength(1)

    act(() => {
      store.set(chatBackgroundTasksAtom, [])
    })
    expect(result.current.tasks).toHaveLength(0)
  })

  it('cancelTask posts with the active session id and the task id', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    const expected: CancelTaskResult = {
      task_id: 'toolu_01ABC',
      killed_pids: [],
      capped: false,
    }
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce(expected)

    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })

    const out = await result.current.cancelTask('toolu_01ABC')
    expect(chatApi.cancelTask).toHaveBeenCalledWith('sess-42', 'toolu_01ABC', expect.any(Function))
    expect(out).toEqual(expected)
  })

  it('cancelTask surfaces capped:true without throwing', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-cap')
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_X',
      killed_pids: [],
      capped: true,
    })

    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })

    const out = await result.current.cancelTask('toolu_X')
    expect(out.capped).toBe(true)
    expect(out.killed_pids).toEqual([])
  })

  it('cancelTask throws when no session is active', async () => {
    const store = createStore()
    // chatSessionIdAtom default is null — no need to set explicitly.

    const { result } = renderHook(() => useBackgroundTasks(), {
      wrapper: withStore(store),
    })

    await expect(result.current.cancelTask('toolu_X')).rejects.toThrow(
      /no active chat session/i,
    )
    expect(chatApi.cancelTask).not.toHaveBeenCalled()
  })

  it('a 409 owner_unreachable throws a CancelFailedError that reports an unreachable owner', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(
      new ApiError(409, JSON.stringify({ error: 'gone', code: 'owner_unreachable', retryable: false })),
    )
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper: withStore(store) })
    const err = await result.current.cancelTask('toolu_X').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CancelFailedError)
    expect((err as CancelFailedError).failure).toEqual({ code: 'owner_unreachable', retryable: false, ownerUnreachable: true, status: 409 })
  })

  it('retryable is what the body says (504 retryable:true, 502 not), but never for a 410', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper: withStore(store) })
    const cases: Array<[number, string, boolean]> = [
      [504, 'owner_timeout', true],
      [410, 'session_gone', false],
      [502, 'relay_failed', false],
    ]
    for (const [status, code, retryable] of cases) {
      // The 410 body says retryable:true; the interface still never invites a retry.
      vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(new ApiError(status, JSON.stringify({ error: 'x', code, retryable: retryable || status === 410 })))
      const err = (await result.current.cancelTask('toolu_X').catch((e: unknown) => e)) as CancelFailedError
      expect(err.failure).toEqual({ code, retryable, ownerUnreachable: false, status })
    }
  })

  it('only authorizes sending for the same session, confirmed mode, and unexpired user token', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    store.set(authModeAtom, 'required')
    store.set(authModeConfirmedAtom, true)
    store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' })
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 'task', killed_pids: [], capped: false })
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper: withStore(store) })
    await result.current.cancelTask('task')
    const guard = vi.mocked(chatApi.cancelTask).mock.calls[0][2]
    const token = (sub: string, exp: number) => `e30.${btoa(JSON.stringify({ sub, exp }))}.sig`
    const now = Math.floor(Date.now() / 1000)
    expect(guard(token('user-a', now + 60))).toBe(true)
    expect(guard(token('user-b', now + 60))).toBe(false)
    expect(guard(token('user-a', now - 1))).toBe(false)
    expect(guard(null)).toBe(false)
    expect(guard('invalid')).toBe(false)
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    expect(guard(token('user-a', now + 60))).toBe(false)
    act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    act(() => store.set(chatSessionIdAtom, 'other-session'))
    expect(guard(token('user-a', now + 60))).toBe(false)
    act(() => store.set(chatSessionIdAtom, 'sess-42'))
    act(() => store.set(authModeConfirmedAtom, false))
    expect(guard(token('user-a', now + 60))).toBe(false)
  })

  it('allows no-auth only when the server confirmed that mode', async () => {
    vi.mocked(getAuthMode).mockReturnValueOnce('none').mockReturnValueOnce('none')
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    store.set(authModeAtom, 'none')
    store.set(authModeConfirmedAtom, true)
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 'task', killed_pids: [], capped: false })
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper: withStore(store) })
    await result.current.cancelTask('task')
    const guard = vi.mocked(chatApi.cancelTask).mock.calls[0][2]
    expect(guard(null)).toBe(true)
    expect(guard('anything')).toBe(false)
    act(() => store.set(authModeConfirmedAtom, false))
    expect(guard(null)).toBe(false)
  })

})
