/**
 * What the live server says a conversation is doing — the only thing that makes
 * a question card actionable (`questionAwaitsPerson`, `AskUserQuestionBlock`).
 *
 * The invariant under test is the ASYMMETRY: a positive verdict must reach the
 * card intact, and nothing else may ever be turned into one. An unknown answer
 * (never asked, failed read) stays `null`, and `null` is not "open".
 *
 * Run with: npx vitest run src/hooks/__tests__/useSessionActivity.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QUIET_ACTIVITY, type SessionActivity } from '@/types'

const getLiveActivity = vi.fn()

vi.mock('@/services/chat', () => ({ chatApi: { getLiveActivity: () => getLiveActivity() } }))

import { useSessionActivity, SESSION_ACTIVITY_POLL_MS } from '../useSessionActivity'

const OPEN: SessionActivity = {
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  state: 'waiting_on_person',
  state_reason: { rule: 'question_open', age_ms: 800 },
}

beforeEach(() => {
  getLiveActivity.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSessionActivity', () => {
  it('asks nothing at all when no question is on screen', () => {
    const { result } = renderHook(() => useSessionActivity('s1', null))
    expect(getLiveActivity).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('hands back the server verdict as it is', async () => {
    getLiveActivity.mockResolvedValue({ generated_at: '', sessions: { s1: OPEN } })
    const { result } = renderHook(() => useSessionActivity('s1', 'q1'))
    await waitFor(() => expect(result.current?.state).toBe('waiting_on_person'))
    expect(result.current?.state_reason?.rule).toBe('question_open')
  })

  it('a session the server does not list is quiet, and asking stops there', async () => {
    vi.useFakeTimers()
    getLiveActivity.mockResolvedValue({ generated_at: '', sessions: {} })
    const { result } = renderHook(() => useSessionActivity('s1', 'q1'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    // Not live: no question can open there again, so the read stops instead of
    // polling for an interrupted card for ever.
    expect(result.current).toEqual(QUIET_ACTIVITY)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_ACTIVITY_POLL_MS * 3)
    })
    expect(getLiveActivity).toHaveBeenCalledTimes(1)
  })

  it('a failed read is not a verdict: the answer stays unknown', async () => {
    getLiveActivity.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSessionActivity('s1', 'q1'))
    await waitFor(() => expect(getLiveActivity).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('keeps polling while the session is live', async () => {
    vi.useFakeTimers()
    getLiveActivity.mockResolvedValue({ generated_at: '', sessions: { s1: OPEN } })
    renderHook(() => useSessionActivity('s1', 'q1'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_ACTIVITY_POLL_MS)
    })
    expect(getLiveActivity).toHaveBeenCalledTimes(2)
  })
})
