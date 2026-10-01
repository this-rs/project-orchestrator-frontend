/**
 * Regression: useSessionTree must resume polling when new activity starts.
 *
 * Polling stopped as soon as no node was streaming and was never restarted,
 * so children spawned afterwards stayed invisible. The hook now accepts a
 * refresh signal (e.g. the chat streaming flag) and re-fetches + re-arms
 * polling whenever it changes.
 *
 * Run with: npx vitest run src/hooks/__tests__/useSessionTree.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/services/chat', () => ({
  chatApi: { getSessionTree: vi.fn() },
}))

import { chatApi } from '@/services/chat'
import { useSessionTree } from '../useSessionTree'

const node = (id: string, is_streaming: boolean) =>
  ({ session_id: id, is_streaming }) as never

describe('useSessionTree (regression: late children must become visible)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(chatApi.getSessionTree).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-fetches and resumes polling when the refresh signal changes after polling stopped', async () => {
    const get = vi.mocked(chatApi.getSessionTree)
    get.mockResolvedValue([node('root', false)])
    const { result, rerender } = renderHook(
      ({ sig }: { sig: boolean }) => useSessionTree('root', sig),
      { initialProps: { sig: false } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.tree).toHaveLength(1)

    // Nothing streaming: polling stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    const callsWhileIdle = get.mock.calls.length

    // A child is spawned and the chat starts streaming again.
    get.mockResolvedValue([node('root', true), node('child', true)])
    rerender({ sig: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(get.mock.calls.length).toBeGreaterThan(callsWhileIdle)
    expect(result.current.tree).toHaveLength(2)
  })
})
