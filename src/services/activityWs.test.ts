/**
 * Tests for ActivityStreamClient — the replay cursor is the whole point.
 *
 * The three behaviours that would silently break the hub if they regressed:
 * 1. the connection announces itself with `"ready"` and waits for `auth_ok`
 *    before treating anything as activity;
 * 2. the cursor advances on every event and is sent back as `last_seq` on the
 *    next connection (a reconnect that loses it shows a hole in the log);
 * 3. `lag_dropped` is surfaced, never swallowed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface CapturedCallbacks {
  onopen?: (ev: Event) => void
  onmessage?: (ev: MessageEvent) => void
  onclose?: (ev: CloseEvent) => void
  onerror?: (ev: Event) => void
}

let captured: CapturedCallbacks = {}
let openedUrls: string[] = []
let mockWs: {
  readyState: number
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function installMocks() {
  captured = {}
  openedUrls = []
  mockWs = {
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: vi.fn(),
    close: vi.fn(),
  }

  vi.doMock('./wsAdapter', () => ({
    createWebSocket: vi.fn(async (url: string, callbacks: CapturedCallbacks) => {
      openedUrls.push(url)
      captured = callbacks ?? {}
      return mockWs
    }),
    ReadyState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
  }))
  vi.doMock('./auth', () => ({ fetchWsTicket: async () => 'ticket-1' }))
  vi.doMock('./env', () => ({ wsUrl: (path: string) => `ws://localhost:6600${path}` }))
}

/** Deliver a server frame to the client's message handler. */
function frame(payload: unknown) {
  captured.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
}

/** Open the socket and complete the auth handshake. */

describe('ActivityStreamClient', () => {
  beforeEach(() => {
    vi.resetModules()
    installMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('./wsAdapter')
    vi.doUnmock('./auth')
    vi.doUnmock('./env')
  })

  it('says "ready" on open and only then accepts frames', async () => {
    const { ActivityStreamClient } = await import('./activityWs')
    const events: unknown[] = []
    const client = new ActivityStreamClient(
      { projectId: 'p1', categories: ['plan_run'] },
      { onEvent: (event) => events.push(event), onStatus: () => {} },
    )

    await client.connect()
    captured.onopen?.(new Event('open'))
    expect(mockWs.send.mock.calls.map((call) => call[0])).toContain('"ready"')

    // Before `auth_ok`, a frame must not be dispatched as activity: the server
    // sends it first, and trusting a pre-auth frame would let anything write to
    // the log.
    frame({ kind: 'activity', event: { seq: 1, entity_id: 'run-1' } })
    expect(events).toHaveLength(0)

    frame({ type: 'auth_ok' })
    frame({
      kind: 'activity',
      event: {
        seq: 7,
        ts: '2026-01-01T00:00:00Z',
        category: 'plan_run',
        entity_type: 'runner',
        entity_id: 'run-1',
        action: 'updated',
      },
    })
    expect(events).toHaveLength(1)
    expect(client.cursor).toBe(7)
    expect(openedUrls[0]).toContain('entity_types=plan_run')
    expect(openedUrls[0]).toContain('project_id=p1')
    expect(openedUrls[0]).toContain('ticket=ticket-1')
  })

  it('sends the cursor back as last_seq on reconnect', async () => {
    vi.useFakeTimers()
    const { ActivityStreamClient } = await import('./activityWs')
    const client = new ActivityStreamClient({}, { onEvent: () => {}, onStatus: () => {} }, 41)

    await client.connect()
    expect(openedUrls[0]).toContain('last_seq=41')

    captured.onopen?.(new Event('open'))
    frame({ type: 'auth_ok' })
    frame({
      kind: 'activity',
      event: {
        seq: 55,
        ts: '2026-01-01T00:00:00Z',
        category: 'entity',
        entity_type: 'task',
        entity_id: 'task-1',
        action: 'updated',
      },
    })
    expect(client.cursor).toBe(55)

    // The socket dies: the client must come back asking for what it missed.
    captured.onclose?.(new Event('close') as unknown as CloseEvent)
    await vi.advanceTimersByTimeAsync(1000)
    expect(openedUrls).toHaveLength(2)
    expect(openedUrls[1]).toContain('last_seq=55')
  })

  it('surfaces a dropped-events frame instead of swallowing it', async () => {
    const { ActivityStreamClient } = await import('./activityWs')
    const gaps: number[] = []
    const client = new ActivityStreamClient({}, { onEvent: () => {}, onStatus: () => {}, onGap: (n) => gaps.push(n) })

    await client.connect()
    captured.onopen?.(new Event('open'))
    frame({ type: 'auth_ok' })
    frame({ kind: 'lag_dropped', skipped: 12 })

    expect(gaps).toEqual([12])
  })

  it('reports the live/offline status transitions', async () => {
    const { ActivityStreamClient } = await import('./activityWs')
    const statuses: string[] = []
    const client = new ActivityStreamClient({}, { onEvent: () => {}, onStatus: (s) => statuses.push(s) })

    await client.connect()
    captured.onopen?.(new Event('open'))
    frame({ type: 'auth_ok' })
    expect(statuses).toContain('connected')

    client.disconnect()
    expect(statuses[statuses.length - 1]).toBe('disconnected')
  })
})
