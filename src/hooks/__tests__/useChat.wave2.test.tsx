/**
 * WAVE2-FRONT — the streaming flag across a reconnect (D7), a missed `result`
 * (D8) and a local queue row on a dead socket (D10).
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.wave2.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom, chatMessageQueuesAtom } from '@/atoms'

vi.mock('@/services', () => {
  type Callbacks = {
    onEvent?: (event: Record<string, unknown>) => void
    onStatusChange?: (status: string) => void
    onReplayComplete?: () => void
    onResync?: () => void
  }
  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    static sendResult = true
    static userMessageCalls = 0
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    sent: unknown[][] = []
    constructor() {
      FakeChatWebSocket.instances.push(this)
    }
    setCallbacks(cb: Callbacks) {
      Object.assign(this.callbacks, cb)
    }
    async connect(sessionId: string) {
      this.sessionId = sessionId
      this.status = 'connected'
    }
    disconnect() {
      this.sessionId = null
      this.status = 'disconnected'
    }
    send() {
      return true
    }
    sendUserMessage(...args: unknown[]) {
      FakeChatWebSocket.userMessageCalls++
      if (FakeChatWebSocket.sendResult) this.sent.push(['user_message', ...args])
      return FakeChatWebSocket.sendResult
    }
    sendQueueOp() {
      return FakeChatWebSocket.sendResult
    }
    sendQueueSnapshot() {
      return true
    }
    sendInterrupt() {
      return true
    }
    sendPermissionResponse() {
      return true
    }
    sendInputResponse() {
      return true
    }
    sendSetPermissionMode() {
      return true
    }
    sendSetModel() {
      return true
    }
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, events: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp' }),
      getLiveActivity: vi.fn(),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = InstanceType<typeof ChatWebSocket> & {
  callbacks: {
    onEvent: (event: Record<string, unknown>) => void
    onStatusChange: (status: string) => void
    onReplayComplete: () => void
    onResync: () => void
  }
  sent: unknown[][]
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[]; sendResult: boolean; userMessageCalls: number }
const liveActivity = chatApi.getLiveActivity as unknown as ReturnType<typeof vi.fn>
const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>

const serverSays = (streaming: boolean | null) =>
  liveActivity.mockResolvedValue({ sessions: streaming === null ? {} : { 'sess-1': { live: true, streaming } } })

async function setup() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(getMessages).toHaveBeenCalled()
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return { ...rendered, store, ws: FakeWS.instances[FakeWS.instances.length - 1] }
}

const queueOf = (store: ReturnType<typeof createStore>) => store.get(chatMessageQueuesAtom)['sess-1'] ?? []

beforeEach(() => {
  FakeWS.instances.length = 0
  FakeWS.sendResult = true
  FakeWS.userMessageCalls = 0
  vi.clearAllMocks()
  getMessages.mockResolvedValue({ total_count: 0, messages: [] })
  serverSays(null)
})

describe('D7 — a reconnect does not erase Stop on a turn the server still runs', () => {
  it('keeps the flag while reconnecting, and after the replay when the server still says streaming', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    expect(result.current.isStreaming).toBe(true)

    serverSays(true)
    act(() => ws.callbacks.onStatusChange('reconnecting'))
    expect(result.current.isStreaming).toBe(true)

    // The replay brought no streaming_status: only the REST read can say.
    act(() => ws.callbacks.onReplayComplete())
    await waitFor(() => expect(liveActivity).toHaveBeenCalled())
    expect(result.current.isStreaming).toBe(true)
  })

  it('drops the flag after the reconnect when the server says the turn ended meanwhile', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    serverSays(false)
    act(() => ws.callbacks.onStatusChange('reconnecting'))
    act(() => ws.callbacks.onReplayComplete())
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
  })

  it('does not act on an unreadable answer (an unknown is not a verdict)', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    liveActivity.mockRejectedValue(new Error('network'))
    act(() => ws.callbacks.onReplayComplete())
    await waitFor(() => expect(liveActivity).toHaveBeenCalled())
    await act(async () => {})
    expect(result.current.isStreaming).toBe(true)
  })
})

describe('D8 — a missed `result` does not keep queueing messages', () => {
  it('heals a stale flag from the server when a message is queued, with no textarea involved', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    expect(result.current.isStreaming).toBe(true)

    serverSays(false) // nothing runs: the `result` was missed
    act(() => result.current.queueMessage('typed while the flag was stale'))
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
  })

  it('heals a stale flag when the tab regains focus', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    serverSays(false)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
  })

  it('does not drop the flag of a turn that started and has emitted nothing yet (tail = user_message)', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    // Persisted history ends on the user's message: the assistant has not written anything yet.
    getMessages.mockImplementation(async (_sid: string, opts: { limit: number; offset: number }) => {
      const events = [{ type: 'user_message', content: 'question', seq: 1 }]
      return { total_count: events.length, messages: events.slice(opts.offset, opts.offset + opts.limit) }
    })
    serverSays(true) // the turn runs
    act(() => ws.callbacks.onResync())
    await waitFor(() => expect(liveActivity).toHaveBeenCalled())
    await act(async () => {})
    expect(result.current.isStreaming).toBe(true)
  })

  it('discards a verdict older than a flag change (a turn started while the request was in flight)', async () => {
    const { result, ws } = await setup()
    let answer: (v: unknown) => void = () => {}
    liveActivity.mockReturnValue(new Promise((r) => (answer = r)))
    act(() => ws.callbacks.onReplayComplete()) // asks while the flag is false
    // A turn starts meanwhile...
    act(() => ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true }))
    // ...and the older snapshot says "not streaming".
    await act(async () => answer({ sessions: { 'sess-1': { live: true, streaming: false } } }))
    expect(result.current.isStreaming).toBe(true)
  })
})

describe('D10 — a local queue row on a dead socket', () => {
  it('"send now" on a local row is a retry: it leaves as soon as the socket allows', async () => {
    const { result, store } = await setup()
    FakeWS.sendResult = false
    act(() => result.current.queueMessage('first'))
    expect(queueOf(store).map((m) => [m.text, m.local])).toEqual([['first', true]])
    const id = queueOf(store)[0].id

    FakeWS.sendResult = true // the socket is back, no replay-complete has fired yet
    act(() => result.current.queueOp({ op: 'send_now', id }))
    expect(queueOf(store)).toEqual([])
    expect(FakeWS.instances[FakeWS.instances.length - 1].sent).toEqual([['user_message', 'first', undefined, { queue: true }]])
  })

  it('a retry on a socket that stays dead ends after one bounded pass, keeps order and every row', async () => {
    const { result, store } = await setup()
    FakeWS.sendResult = false
    act(() => {
      result.current.queueMessage('one')
      result.current.queueMessage('two')
      result.current.queueMessage('three')
    })
    FakeWS.userMessageCalls = 0
    const id = queueOf(store)[2].id
    act(() => result.current.queueOp({ op: 'send_now', id })) // goes first, then a retry
    // One attempt (the head), then stop: no loop over the dead socket, no row lost.
    expect(FakeWS.userMessageCalls).toBe(1)
    expect(queueOf(store).map((m) => m.text)).toEqual(['three', 'one', 'two'])
    expect(queueOf(store).every((m) => m.local)).toBe(true)
  })

  it('a replay-complete on a dead socket also ends after one attempt', async () => {
    const { result, store, ws } = await setup()
    FakeWS.sendResult = false
    act(() => {
      result.current.queueMessage('one')
      result.current.queueMessage('two')
    })
    FakeWS.userMessageCalls = 0
    act(() => ws.callbacks.onReplayComplete())
    expect(FakeWS.userMessageCalls).toBe(1)
    expect(queueOf(store)).toHaveLength(2)
  })
})
