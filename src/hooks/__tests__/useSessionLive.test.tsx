/**
 * D9 — `cannotResume` is asked again: a session that came back to life must not
 * leave the composer closed for good, and the asking must stop by itself.
 *
 * Run with: npx vitest run src/hooks/__tests__/useSessionLive.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/services/chat', () => ({ chatApi: { getLiveActivity: vi.fn() } }))

import { chatApi } from '@/services/chat'
import { useSessionLive, SESSION_LIVE_RECHECK_MS } from '../useSessionLive'

const live = chatApi.getLiveActivity as unknown as ReturnType<typeof vi.fn>
const answer = (isLive: boolean) => live.mockResolvedValue({ sessions: { s1: { live: isLive, streaming: false } } })
const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('useSessionLive re-asks', () => {
  it('unlocks a session that came back to life when the tab regains focus', async () => {
    answer(false)
    const { result } = renderHook(() => useSessionLive('s1', true, false))
    await flush()
    expect(result.current).toBe(false)

    answer(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    expect(result.current).toBe(true)
  })

  it('polls while the answer is "dead", and the poll unlocks the session', async () => {
    answer(false)
    const { result } = renderHook(() => useSessionLive('s1', true, false))
    await flush()
    expect(result.current).toBe(false)

    answer(true)
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS)
    })
    await flush()
    expect(result.current).toBe(true)
  })
})

describe('useSessionLive stops asking (no leak)', () => {
  it('stops polling once the session is live', async () => {
    answer(false)
    renderHook(() => useSessionLive('s1', true, false))
    await flush()
    answer(true)
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS)
    })
    await flush()
    live.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS * 5)
    })
    expect(live).not.toHaveBeenCalled()
  })

  it('stops polling on unmount and removes its focus listeners', async () => {
    answer(false)
    const { unmount } = renderHook(() => useSessionLive('s1', true, false))
    await flush()
    unmount()
    live.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS * 5)
    })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(live).not.toHaveBeenCalled()
  })

  it('stops polling when the session changes (the old one is not asked again)', async () => {
    answer(false)
    const { rerender } = renderHook(({ id }) => useSessionLive(id, true, false), { initialProps: { id: 's1' as string | null } })
    await flush()
    rerender({ id: null })
    live.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS * 5)
    })
    expect(live).not.toHaveBeenCalled()
  })

  it('does not poll while a turn streams, nor when disabled', async () => {
    answer(false)
    renderHook(() => useSessionLive('s1', true, true))
    renderHook(() => useSessionLive('s1', false, false))
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS * 5)
    })
    expect(live).not.toHaveBeenCalled()
  })

  it('does not poll a session already known to be live', async () => {
    answer(true)
    renderHook(() => useSessionLive('s1', true, false))
    await flush()
    live.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(SESSION_LIVE_RECHECK_MS * 5)
    })
    expect(live).not.toHaveBeenCalled()
  })
})
