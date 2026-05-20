/**
 * Tests for ActivityWebSocket — connect/disconnect, status transitions,
 * lastEventSeq tracking, reconnect replay seq, and lag_dropped handling.
 *
 * Run with: npx vitest run src/services/activityWs.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActivityEvent, WsConnectionStatus } from '@/types'

// ---------------------------------------------------------------------------
// Helpers: mock the WebSocket adapter to simulate server messages
// ---------------------------------------------------------------------------

let lastCreateUrl: string | null = null

function setupMocks() {
  let capturedCallbacks: {
    onopen?: (ev: Event) => void
    onmessage?: (ev: MessageEvent) => void
    onclose?: (ev: CloseEvent) => void
    onerror?: (ev: Event) => void
  } = {}

  const mockWs = {
    readyState: 1, // OPEN
    onopen: null as ((ev: Event) => void) | null,
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onclose: null as ((ev: CloseEvent) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    send: vi.fn(),
    close: vi.fn(),
  }

  lastCreateUrl = null

  vi.doMock('./wsAdapter', () => ({
    createWebSocket: vi.fn(async (url: string, callbacks: typeof capturedCallbacks) => {
      lastCreateUrl = url
      capturedCallbacks = callbacks ?? {}
      return mockWs
    }),
    ReadyState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
  }))

  vi.doMock('./auth', () => ({
    getAuthMode: () => 'none',
    fetchWsTicket: async () => null,
  }))

  vi.doMock('./authManager', () => ({
    forceLogout: vi.fn(),
  }))

  vi.doMock('./env', () => ({
    wsUrl: (path: string) => `ws://localhost:6600${path}`,
  }))

  return {
    mockWs,
    serverSend(data: Record<string, unknown>) {
      const event = new MessageEvent('message', { data: JSON.stringify(data) })
      if (capturedCallbacks.onmessage) capturedCallbacks.onmessage(event)
    },
    triggerOpen() {
      const event = new Event('open')
      if (capturedCallbacks.onopen) capturedCallbacks.onopen(event)
    },
    triggerClose() {
      const event = new CloseEvent('close')
      if (capturedCallbacks.onclose) capturedCallbacks.onclose(event)
    },
  }
}

// Tiny helper that fabricates an `ActivityEvent` of the `runner` kind.
function runnerEvent(seq: number, run_id = '00000000-0000-0000-0000-000000000001'): ActivityEvent {
  return {
    kind: 'runner',
    seq,
    timestamp: '2026-05-21T09:30:00Z',
    run_id,
    event: {
      event: 'task_started',
      run_id,
      task_id: '00000000-0000-0000-0000-000000000002',
      task_title: 'T-' + seq,
      wave_number: 1,
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityWebSocket — connect + auth + events', () => {
  let mock: ReturnType<typeof setupMocks>
  let statuses: WsConnectionStatus[]
  let events: ActivityEvent[]

  beforeEach(async () => {
    vi.resetModules()
    mock = setupMocks()

    statuses = []
    events = []
  })

  it('reaches connected status after auth_ok handshake', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()

    ws.setCallbacks({
      onStatusChange: (s) => statuses.push(s),
      onEvent: (e) => events.push(e),
    })

    await ws.connect({ project_id: 'proj-1' }, 0)
    mock.triggerOpen()
    expect(mock.mockWs.send).toHaveBeenCalledWith('"ready"')

    mock.serverSend({ type: 'auth_ok' })
    expect(ws.status).toBe('connected')
    expect(statuses).toContain('connecting')
    expect(statuses).toContain('connected')
  })

  it('passes project_id and lastEventSeq through the WebSocket URL', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()

    await ws.connect({ project_id: 'proj-42', entity_types: ['runner', 'crud'] }, 17)

    expect(lastCreateUrl).toContain('/ws/activity?')
    expect(lastCreateUrl).toContain('project_id=proj-42')
    expect(lastCreateUrl).toContain('lastEventSeq=17')
    expect(lastCreateUrl).toContain('entity_types=runner%2Ccrud')
  })

  it('updates lastEventSeq on each activity frame received', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()

    ws.setCallbacks({
      onEvent: (e) => events.push(e),
    })

    await ws.connect({ project_id: 'proj-1' }, 0)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
    mock.serverSend({ type: 'connected', last_seq: 5, replayed: 0 })

    mock.serverSend({ type: 'activity', event: runnerEvent(6) })
    mock.serverSend({ type: 'activity', event: runnerEvent(7) })
    mock.serverSend({ type: 'activity', event: runnerEvent(8) })

    expect(events).toHaveLength(3)
    expect(ws.lastEventSeq).toBe(8)
  })

  it('handshake `connected` frame raises lastEventSeq if greater', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()
    let connectedHead: { last_seq: number; replayed: number } | null = null
    ws.setCallbacks({
      onConnected: (h) => {
        connectedHead = h
      },
    })

    await ws.connect({ project_id: 'proj-1' }, 0)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
    mock.serverSend({ type: 'connected', last_seq: 42, replayed: 3 })

    expect(connectedHead).toEqual({ last_seq: 42, replayed: 3 })
    expect(ws.lastEventSeq).toBe(42)
  })

  it('does not regress lastEventSeq when `connected.last_seq` is lower', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()

    await ws.connect({ project_id: 'proj-1' }, 100)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
    // Server head is behind what the client already has (rare but possible if
    // multiple servers / restarts) — we keep our higher seq.
    mock.serverSend({ type: 'connected', last_seq: 50, replayed: 0 })

    expect(ws.lastEventSeq).toBe(100)
  })

  it('invokes onLagDropped on `lag_dropped` frames', async () => {
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()
    const lag: number[] = []
    ws.setCallbacks({ onLagDropped: (n) => lag.push(n) })

    await ws.connect({ project_id: 'proj-1' }, 0)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
    mock.serverSend({ type: 'lag_dropped', skipped: 12 })

    expect(lag).toEqual([12])
  })
})

describe('ActivityWebSocket — reconnect + last_event_seq replay', () => {
  it('reuses the highest observed seq when reconnecting after close', async () => {
    vi.useFakeTimers()
    try {
      vi.resetModules()
      const mock = setupMocks()
      const { ActivityWebSocket } = await import('./activityWs')
      const ws = new ActivityWebSocket()

      const statuses: WsConnectionStatus[] = []
      ws.setCallbacks({ onStatusChange: (s) => statuses.push(s) })

      // Initial connect.
      await ws.connect({ project_id: 'proj-1' }, 0)
      mock.triggerOpen()
      mock.serverSend({ type: 'auth_ok' })
      mock.serverSend({ type: 'connected', last_seq: 0, replayed: 0 })
      mock.serverSend({ type: 'activity', event: runnerEvent(1) })
      mock.serverSend({ type: 'activity', event: runnerEvent(2) })
      mock.serverSend({ type: 'activity', event: runnerEvent(3) })
      expect(ws.lastEventSeq).toBe(3)

      // Server closes the socket — the client should schedule a reconnect.
      mock.triggerClose()
      expect(ws.status).toBe('reconnecting')

      // Fast-forward the 1s exponential backoff.
      await vi.advanceTimersByTimeAsync(1500)

      // The reconnect URL must carry lastEventSeq=3 so the server can replay
      // events strictly newer than the highest delivered seq.
      expect(lastCreateUrl).toContain('lastEventSeq=3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('disconnect() cancels pending reconnect timers and stays disconnected', async () => {
    vi.useFakeTimers()
    try {
      vi.resetModules()
      const mock = setupMocks()
      const { ActivityWebSocket } = await import('./activityWs')
      const ws = new ActivityWebSocket()

      await ws.connect({ project_id: 'proj-1' }, 0)
      mock.triggerOpen()
      mock.serverSend({ type: 'auth_ok' })
      mock.triggerClose() // → 'reconnecting' + pending timer

      ws.disconnect()
      expect(ws.status).toBe('disconnected')

      // Even after time elapses, no second URL was opened.
      const urlBefore = lastCreateUrl
      await vi.advanceTimersByTimeAsync(60_000)
      expect(lastCreateUrl).toBe(urlBefore)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops frames received before auth_ok', async () => {
    vi.resetModules()
    const mock = setupMocks()
    const { ActivityWebSocket } = await import('./activityWs')
    const ws = new ActivityWebSocket()

    const events: ActivityEvent[] = []
    ws.setCallbacks({ onEvent: (e) => events.push(e) })

    await ws.connect({ project_id: 'proj-1' }, 0)
    mock.triggerOpen()
    // Send an activity event BEFORE auth_ok — should be ignored.
    mock.serverSend({ type: 'activity', event: runnerEvent(1) })
    expect(events).toHaveLength(0)

    mock.serverSend({ type: 'auth_ok' })
    mock.serverSend({ type: 'activity', event: runnerEvent(2) })
    expect(events).toHaveLength(1)
    expect(events[0].seq).toBe(2)
  })
})
