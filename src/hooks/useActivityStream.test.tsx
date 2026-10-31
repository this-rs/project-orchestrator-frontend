/**
 * Tests for `useActivityStream` — the contract the Activity Hub page relies on.
 *
 * The hook has one non-obvious job: the snapshot is the truth and the feed is
 * only a *notification* that it moved. So an event must (a) appear in the log,
 * (b) bump the entity's pulse token, and (c) trigger a debounced snapshot
 * re-read — never a hand-rolled reconstruction of run state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ActivityEvent, ActivitySnapshot } from '@/types/activity'

const snapshot = (lastSeq: number): ActivitySnapshot => ({
  generated_at: '2026-01-01T00:00:00Z',
  last_event_seq: lastSeq,
  counts: { plan_runs: 1, protocol_runs: 0, chat_sessions: 0, total: 1 },
  plan_runs: [
    {
      run_id: 'run-1',
      plan_id: 'plan-1',
      plan_title: 'Plan',
      status: 'running',
      current_wave: 1,
      total_tasks: 4,
      completed_tasks: 2,
      failed_tasks: 0,
      active_tasks: [],
      git_branch: 'feat/x',
      started_at: '2026-01-01T00:00:00Z',
      elapsed_secs: 60,
      cost_usd: 0.2,
      tokens_used: 100,
    },
  ],
  protocol_runs: [],
  chat_sessions: [],
})

const event = (seq: number): ActivityEvent => ({
  seq,
  ts: '2026-01-01T00:00:01Z',
  category: 'plan_run',
  entity_type: 'runner',
  entity_id: 'run-1',
  action: 'updated',
})

/** Handles captured from the mocked client, so a test can drive the stream. */
let handlers: {
  onEvent: (event: ActivityEvent) => void
  onStatus: (status: string) => void
  onReady?: (seq: number, replayed: number) => void
  onGap?: (skipped: number) => void
} | null = null
let clientCursors: number[] = []
const disconnect = vi.fn()

function installMocks() {
  handlers = null
  clientCursors = []
  disconnect.mockClear()

  vi.doMock('@/services/activityApi', () => ({
    fetchActivitySnapshot: vi.fn(async () => snapshot(10)),
  }))

  vi.doMock('@/services/activityWs', () => ({
    ActivityStreamClient: class {
      constructor(
        _query: unknown,
        streamHandlers: typeof handlers,
        initialSeq: number,
      ) {
        handlers = streamHandlers
        clientCursors.push(initialSeq)
      }
      connect = vi.fn(async () => {})
      disconnect = disconnect
      setCursor = vi.fn()
      setQuery = vi.fn()
    },
  }))
}

describe('useActivityStream', () => {
  beforeEach(() => {
    vi.resetModules()
    installMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('@/services/activityApi')
    vi.doUnmock('@/services/activityWs')
  })

  it('loads the snapshot and starts the stream at its cursor', async () => {
    const { useActivityStream } = await import('./useActivityStream')
    const { result } = renderHook(() => useActivityStream({ workspaceSlug: 'ws' }))

    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    expect(result.current.snapshot?.plan_runs).toHaveLength(1)
    expect(result.current.loading).toBe(false)
    await waitFor(() => expect(clientCursors).toEqual([10]))
  })

  it('appends an event, bumps the pulse token and re-reads the snapshot once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { useActivityStream } = await import('./useActivityStream')
    const api = await import('@/services/activityApi')
    const { result } = renderHook(() => useActivityStream({ workspaceSlug: 'ws' }))

    await waitFor(() => expect(handlers).not.toBeNull())
    const initialCalls = (api.fetchActivitySnapshot as unknown as { mock: { calls: unknown[] } }).mock.calls.length

    act(() => {
      handlers?.onEvent(event(11))
    })

    expect(result.current.events.map((entry) => entry.seq)).toEqual([11])
    expect(result.current.lastEventSeqByEntity['run-1']).toBe(11)

    // Two more events in the same burst must not cost two more requests.
    act(() => {
      handlers?.onEvent(event(12))
      handlers?.onEvent(event(13))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200)
    })

    const calls = (api.fetchActivitySnapshot as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    expect(calls).toBe(initialCalls + 1)
  })

  it('reports a gap and re-reads the snapshot immediately', async () => {
    const { useActivityStream } = await import('./useActivityStream')
    const api = await import('@/services/activityApi')
    const { result } = renderHook(() => useActivityStream({ workspaceSlug: 'ws' }))

    await waitFor(() => expect(handlers).not.toBeNull())
    const initialCalls = (api.fetchActivitySnapshot as unknown as { mock: { calls: unknown[] } }).mock.calls.length

    act(() => {
      handlers?.onGap?.(42)
    })

    expect(result.current.gap).toBe(42)
    await waitFor(() => {
      const calls = (api.fetchActivitySnapshot as unknown as { mock: { calls: unknown[] } }).mock.calls.length
      expect(calls).toBeGreaterThan(initialCalls)
    })
  })

  it('disconnects when unmounted', async () => {
    const { useActivityStream } = await import('./useActivityStream')
    const { unmount } = renderHook(() => useActivityStream({ workspaceSlug: 'ws' }))

    await waitFor(() => expect(handlers).not.toBeNull())
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
