/**
 * ChatWebSocket — generation-token race tests.
 *
 * The bug under test: openSocket() is async (awaits fetchWsTicket, then
 * createWebSocket). Switching sessions during that window used to let the
 * stale attempt resolve later, reassign `this.ws` with live handlers bound
 * to the OLD session, and leak that session's events into the new one.
 *
 * These tests drive the async pipeline with manually-resolved promises so
 * each interleaving is deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

const { fetchWsTicketMock, createWebSocketMock } = vi.hoisted(() => ({
  fetchWsTicketMock: vi.fn(),
  createWebSocketMock: vi.fn(),
}))

vi.mock('../auth', () => ({
  getAuthMode: () => 'none',
  fetchWsTicket: fetchWsTicketMock,
}))

vi.mock('../authManager', () => ({
  forceLogout: vi.fn(),
}))

vi.mock('../env', () => ({
  wsUrl: (path: string) => `ws://test${path}`,
}))

vi.mock('../wsAdapter', async () => {
  const actual = await vi.importActual<typeof import('../wsAdapter')>('../wsAdapter')
  return {
    ReadyState: actual.ReadyState,
    createWebSocket: createWebSocketMock,
  }
})

import { ChatWebSocket } from '../chatWebSocket'
import { ReadyState } from '../wsAdapter'

// ---------------------------------------------------------------------------
// Fake socket helper
// ---------------------------------------------------------------------------

interface FakeSocket {
  readyState: ReadyState
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  /** Test helper: deliver a server frame */
  receive: (payload: unknown) => void
}

function makeFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    readyState: ReadyState.OPEN,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: vi.fn(),
    close: vi.fn(() => {
      socket.readyState = ReadyState.CLOSED
    }),
    receive: (payload: unknown) => {
      socket.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
    },
  }
  return socket
}

/**
 * Wire createWebSocket so the test controls WHEN each socket "opens".
 * Returns per-call deferreds: resolve(i) hands socket i to the awaiting
 * openSocket call, mimicking the Tauri async-connect path (the racy one).
 */
function deferSockets(count: number) {
  const sockets: FakeSocket[] = []
  const resolvers: Array<(s: FakeSocket) => void> = []
  for (let i = 0; i < count; i++) {
    const socket = makeFakeSocket()
    sockets.push(socket)
    createWebSocketMock.mockImplementationOnce(
      (_url: string, callbacks: Record<string, (ev: unknown) => void>) => {
        socket.onopen = callbacks.onopen ?? null
        socket.onmessage = callbacks.onmessage ?? null
        socket.onclose = callbacks.onclose ?? null
        socket.onerror = callbacks.onerror ?? null
        return new Promise<FakeSocket>((resolve) => {
          resolvers[i] = resolve
        })
      },
    )
  }
  return { sockets, open: (i: number) => resolvers[i](sockets[i]) }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  // mockReset (not clearAllMocks): test 2 queues a mockImplementationOnce
  // that is intentionally never consumed — clearAllMocks would leave it in
  // the queue and poison the next test's deferSockets() bookkeeping.
  createWebSocketMock.mockReset()
  fetchWsTicketMock.mockReset()
  fetchWsTicketMock.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatWebSocket generation token', () => {
  it('discards a socket whose open resolves after a session switch', async () => {
    const ws = new ChatWebSocket()
    const events: Array<{ type: string }> = []
    ws.setCallbacks({ onEvent: (e) => events.push(e) })

    const { sockets, open } = deferSockets(2)

    // Connect to A — createWebSocket(A) stays pending.
    const connectA = ws.connect('session-a', Number.MAX_SAFE_INTEGER)
    await flush()

    // User switches to B while A's socket is still opening.
    ws.disconnect()
    const connectB = ws.connect('session-b', Number.MAX_SAFE_INTEGER)
    await flush()

    // A's socket finally opens — the stale attempt must close it, not adopt it.
    open(0)
    await connectA
    open(1)
    await connectB
    await flush()

    expect(sockets[0].close).toHaveBeenCalled()

    // Frames arriving on A's socket must never reach the callbacks.
    sockets[0].receive({ type: 'auth_ok' })
    sockets[0].receive({ type: 'stream_delta', text: 'leaked from A', seq: 0 })
    expect(events).toHaveLength(0)

    // B's socket works normally.
    sockets[1].receive({ type: 'auth_ok' })
    sockets[1].receive({ type: 'stream_delta', text: 'hello from B', seq: 0 })
    expect(events).toEqual([expect.objectContaining({ type: 'stream_delta', text: 'hello from B' })])
    expect(ws.sessionId).toBe('session-b')
  })

  it('abandons an attempt superseded while awaiting the ticket', async () => {
    const ws = new ChatWebSocket()

    // Ticket fetch for A hangs until we release it.
    let releaseTicket!: (v: string | null) => void
    fetchWsTicketMock.mockImplementationOnce(
      () => new Promise((resolve) => { releaseTicket = resolve }),
    )

    const { sockets, open } = deferSockets(1)

    const connectA = ws.connect('session-a', Number.MAX_SAFE_INTEGER)
    await flush()

    // Switch away while A still awaits its ticket.
    ws.disconnect()

    // Ticket resolves — the stale attempt must bail BEFORE opening a socket.
    releaseTicket(null)
    await connectA
    await flush()

    // Only one socket slot was prepared; it must never have been requested.
    expect(createWebSocketMock).not.toHaveBeenCalled()
    // (guard against unused var lint)
    void sockets
    void open
  })

  it('ignores a stale socket close — no bogus reconnect for the new session', async () => {
    const ws = new ChatWebSocket()
    const statuses: string[] = []
    ws.setCallbacks({ onStatusChange: (s) => statuses.push(s) })

    const { sockets, open } = deferSockets(2)

    const connectA = ws.connect('session-a', Number.MAX_SAFE_INTEGER)
    await flush()
    ws.disconnect()
    const connectB = ws.connect('session-b', Number.MAX_SAFE_INTEGER)
    await flush()
    open(0)
    await connectA
    open(1)
    await connectB
    await flush()

    sockets[1].receive({ type: 'auth_ok' })
    statuses.length = 0

    // The dead A socket fires close — must not disturb B's connection.
    sockets[0].onclose?.({} as CloseEvent)
    expect(statuses).toEqual([])
    expect(ws.status).toBe('connected')
  })

  it('reuses a healthy same-session socket on repeat connect', async () => {
    const ws = new ChatWebSocket()
    const { sockets, open } = deferSockets(1)

    const connectA = ws.connect('session-a', Number.MAX_SAFE_INTEGER)
    await flush()
    open(0)
    await connectA
    sockets[0].receive({ type: 'auth_ok' })

    // Second connect to the same session must be a no-op.
    await ws.connect('session-a', Number.MAX_SAFE_INTEGER)
    expect(createWebSocketMock).toHaveBeenCalledTimes(1)
    expect(sockets[0].close).not.toHaveBeenCalled()
  })
})
