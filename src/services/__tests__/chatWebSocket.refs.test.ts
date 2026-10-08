/**
 * ChatWebSocket and references: the `features` of `auth_ok` (contract C7) and
 * the `refs` of the `user_message` frame (C1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fetchWsTicketMock, createWebSocketMock } = vi.hoisted(() => ({
  fetchWsTicketMock: vi.fn(),
  createWebSocketMock: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'none', fetchWsTicket: fetchWsTicketMock }))
vi.mock('../authManager', () => ({ forceLogout: vi.fn() }))
vi.mock('../env', () => ({ wsUrl: (path: string) => `ws://test${path}` }))
vi.mock('../wsAdapter', async () => {
  const actual = await vi.importActual<typeof import('../wsAdapter')>('../wsAdapter')
  return { ReadyState: actual.ReadyState, createWebSocket: createWebSocketMock }
})

import { ChatWebSocket } from '../chatWebSocket'
import { ReadyState } from '../wsAdapter'
import entityRef from '@/refs/__fixtures__/entity_ref.json'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function connected() {
  const socket = {
    readyState: ReadyState.OPEN,
    onmessage: null as ((ev: MessageEvent) => void) | null,
    send: vi.fn(),
    close: vi.fn(),
    receive(payload: unknown) {
      socket.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
    },
  }
  createWebSocketMock.mockImplementationOnce((_url: string, cb: Record<string, (ev: unknown) => void>) => {
    socket.onmessage = cb.onmessage as never
    return Promise.resolve(socket)
  })
  const ws = new ChatWebSocket()
  const features: (readonly string[])[] = []
  ws.setCallbacks({ onFeatures: (f) => features.push(f), onEvent: () => {} })
  await ws.connect('sess-1', Number.MAX_SAFE_INTEGER)
  await flush()
  return { ws, socket, features }
}

beforeEach(() => {
  createWebSocketMock.mockReset()
  fetchWsTicketMock.mockReset()
  fetchWsTicketMock.mockResolvedValue(null)
})

describe('auth_ok features', () => {
  it('reports the features the server announced', async () => {
    const { socket, features } = await connected()
    socket.receive({ type: 'auth_ok', features: ['refs_v1'] })
    expect(features).toEqual([['refs_v1']])
  })

  it('reports an empty list for an older server (no field), and ignores non-string entries', async () => {
    const a = await connected()
    a.socket.receive({ type: 'auth_ok' })
    expect(a.features).toEqual([[]])
    const b = await connected()
    b.socket.receive({ type: 'auth_ok', features: ['refs_v1', 7, null] })
    expect(b.features).toEqual([['refs_v1']])
  })

})

describe('sendUserMessage frames', () => {
  const sent = (socket: { send: ReturnType<typeof vi.fn> }) => JSON.parse(socket.send.mock.calls.at(-1)![0] as string)

  it('puts refs on the frame as {kind,id} pairs and nothing else', async () => {
    const { ws, socket } = await connected()
    socket.receive({ type: 'auth_ok', features: ['refs_v1'] })
    const withLabel = entityRef.cases.map((c) => ({ ...c.ref, label: 'must not travel' }))
    ws.sendUserMessage('hi', undefined, { refs: withLabel as never })
    expect(sent(socket)).toEqual({ type: 'user_message', content: 'hi', refs: entityRef.cases.map((c) => c.ref) })
  })

  it('is byte-for-byte the old frame without refs (absent, or empty)', async () => {
    const { ws, socket } = await connected()
    ws.sendUserMessage('hi', ['d1'])
    expect(sent(socket)).toEqual({ type: 'user_message', content: 'hi', attachments: ['d1'] })
    ws.sendUserMessage('hi', undefined, { queue: true, refs: [] })
    expect(sent(socket)).toEqual({ type: 'user_message', content: 'hi', queue: true })
  })
})
