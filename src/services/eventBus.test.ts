import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface Handlers {
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onclose?: () => void
}
const opened: { url: string; handlers: Handlers; closed: boolean }[] = []

vi.mock('./auth', () => ({ getAuthMode: () => 'none', fetchWsTicket: async () => null }))
vi.mock('./authManager', () => ({ forceLogout: vi.fn() }))
vi.mock('./env', () => ({ wsUrl: (p: string) => p }))
vi.mock('./wsAdapter', () => ({
  ReadyState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
  createWebSocket: async (url: string, handlers: Handlers) => {
    const rec = { url, handlers, closed: false }
    opened.push(rec)
    return {
      readyState: 1,
      send: vi.fn(),
      close: () => {
        rec.closed = true
      },
      onmessage: null,
      onclose: null,
      onerror: null,
    }
  },
}))

import { EventBusClient } from './eventBus'

const settle = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
  await Promise.resolve()
}

describe('EventBusClient — watched sessions', () => {
  let bus: EventBusClient
  beforeEach(async () => {
    vi.useFakeTimers()
    opened.length = 0
    bus = new EventBusClient()
    await bus.connect()
  })
  afterEach(() => {
    bus.disconnect()
    vi.useRealTimers()
  })

  it('opens without a sessions list when nobody watches', () => {
    expect(opened).toHaveLength(1)
    expect(opened[0].url).toBe('/ws/events')
  })

  it('reopens once with the sorted, URL-encoded list', async () => {
    bus.setSessions('markers', ['s2', 's1'])
    await settle(400)
    expect(opened).toHaveLength(2)
    expect(opened[0].closed).toBe(true)
    expect(opened[1].url).toBe('/ws/events?sessions=s1%2Cs2')
  })

  it('several changes within the settle window share ONE reopening', async () => {
    bus.setSessions('a', ['s1'])
    await settle(100)
    bus.setSessions('b', ['s2'])
    await settle(100)
    bus.setSessions('a', ['s1', 's3'])
    await settle(400)
    expect(opened).toHaveLength(2)
    expect(opened[1].url).toBe('/ws/events?sessions=s1%2Cs2%2Cs3')
  })

  it('an unchanged list reopens nothing', async () => {
    bus.setSessions('a', ['s1'])
    await settle(400)
    bus.setSessions('a', ['s1'])
    await settle(400)
    expect(opened).toHaveLength(2)
  })

  it('one caller clearing its list does not erase another caller’s', async () => {
    bus.setSessions('a', ['s1'])
    bus.setSessions('b', ['s2'])
    await settle(400)
    bus.setSessions('a', [])
    await settle(400)
    expect(opened[opened.length - 1].url).toBe('/ws/events?sessions=s2')
  })

  it('stops watching when every caller is gone', async () => {
    bus.setSessions('a', ['s1'])
    await settle(400)
    bus.setSessions('a', [])
    await settle(400)
    expect(opened[opened.length - 1].url).toBe('/ws/events')
  })

  it('never asks for more sessions than the backend accepts', async () => {
    bus.setSessions('a', Array.from({ length: 80 }, (_, i) => `s${String(i).padStart(3, '0')}`))
    await settle(400)
    const list = decodeURIComponent(opened[1].url.split('sessions=')[1]).split(',')
    expect(list).toHaveLength(64)
  })

  it('hands a watched session’s chat frame to its listeners', async () => {
    const seen: [string, unknown][] = []
    bus.onChatFrame((sid, ev) => seen.push([sid, ev]))
    const h = opened[0].handlers
    h.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) })
    h.onmessage?.({ data: JSON.stringify({ kind: 'chat', session_id: 's1', event: { type: 'tool_use', tool: 'Read' } }) })
    expect(seen).toEqual([['s1', { type: 'tool_use', tool: 'Read' }]])
  })

  it('a chat frame without a session or event is ignored, and is not a CRUD event', () => {
    const crud = vi.fn()
    const chat = vi.fn()
    bus.on(crud)
    bus.onChatFrame(chat)
    const h = opened[0].handlers
    h.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) })
    h.onmessage?.({ data: JSON.stringify({ kind: 'chat', event: { type: 'x' } }) })
    h.onmessage?.({ data: JSON.stringify({ kind: 'chat', session_id: 's1' }) })
    expect(chat).not.toHaveBeenCalled()
    expect(crud).not.toHaveBeenCalled()
  })
})
