/**
 * The queued messages, as `useChat` handles them: handed to the server, which
 * holds and delivers them; the list on screen is the one the server publishes.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.queue.test.tsx
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
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    connectCalls: unknown[][] = []

    constructor() {
      FakeChatWebSocket.instances.push(this)
    }
    setCallbacks(cb: Callbacks) {
      Object.assign(this.callbacks, cb)
    }
    async connect(sessionId: string, ...rest: unknown[]) {
      this.connectCalls.push([sessionId, ...rest])
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
    sent: unknown[][] = []
    sendUserMessage(...args: unknown[]) {
      if (FakeChatWebSocket.sendResult) this.sent.push(['user_message', ...args])
      return FakeChatWebSocket.sendResult
    }
    sendQueueOp(action: unknown) {
      if (FakeChatWebSocket.sendResult) this.sent.push(['queue_op', action])
      return FakeChatWebSocket.sendResult
    }
    sendInterrupt() {
      return true
    }
    sendPermissionResponse() {
      return FakeChatWebSocket.sendResult
    }
    sendInputResponse() {
      return FakeChatWebSocket.sendResult
    }
    sendSetPermissionMode() {
      return true
    }
    sendSetModel() {
      return true
    }
    sendSetAutoContinue() {
      return true
    }
  }

  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, events: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = InstanceType<typeof ChatWebSocket> & {
  callbacks: { onEvent: (event: Record<string, unknown>) => void; onReplayComplete: () => void }
  sent: unknown[][]
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[]; sendResult: boolean }

async function setup() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(chatApi.getMessages).toHaveBeenCalled()
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return { ...rendered, store, ws: FakeWS.instances[FakeWS.instances.length - 1] }
}

const queueOf = (store: ReturnType<typeof createStore>, key = 'sess-1') => store.get(chatMessageQueuesAtom)[key] ?? []

const held = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  content,
  queued_at: '2026-10-04T12:00:00Z',
  ...extra,
})

describe('useChat — queued messages are held by the session', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    FakeWS.sendResult = true
    vi.clearAllMocks()
  })

  it('hands a queued message to the server with `queue: true`, and adds no bubble', async () => {
    const { result, store, ws } = await setup()
    act(() => result.current.queueMessage('after you finish', ['doc-1']))

    expect(ws.sent).toEqual([['user_message', 'after you finish', ['doc-1'], { queue: true }]])
    // Handed over: the row now comes from the server's list, not from here.
    expect(queueOf(store)).toEqual([])
    // Not sent yet, so not in the transcript: it appears when the session delivers it.
    expect(result.current.messages).toEqual([])
  })

  it('shows the list the server publishes for the conversation', async () => {
    const { result, store, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [held('s1', 'first'), held('s2', 'second', { prioritized: true })] })
    })
    expect(queueOf(store).map((m) => [m.id, m.text, m.prioritized ?? false])).toEqual([
      ['s1', 'first', false],
      ['s2', 'second', true],
    ])

    // It is not part of the transcript: no message, not even an empty assistant one.
    expect(result.current.messages).toEqual([])

    // The session delivered them: the list empties.
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [] })
    })
    expect(queueOf(store)).toEqual([])
  })

  it('shows on this device a message queued from another device of the same conversation', async () => {
    // Device B never called `queueMessage`: the list reaches it because the
    // session publishes it to every connected client.
    const { result, store, ws } = await setup()
    expect(queueOf(store)).toEqual([])
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [held('from-phone', 'typed on my phone')] })
    })
    expect(queueOf(store).map((m) => [m.id, m.text])).toEqual([['from-phone', 'typed on my phone']])

    // And an action here acts on the same server-side entry.
    act(() => result.current.queueOp({ op: 'remove', id: 'from-phone' }))
    expect((FakeWS.instances[FakeWS.instances.length - 1] as unknown as { sent: unknown[][] }).sent).toEqual([
      ['queue_op', { op: 'remove', id: 'from-phone' }],
    ])
  })

  it('keeps a message it could not hand over, shows it, and hands it over on reconnect', async () => {
    const { result, store, ws } = await setup()
    FakeWS.sendResult = false
    act(() => result.current.queueMessage('socket is down'))

    expect(ws.sent).toEqual([])
    expect(queueOf(store).map((m) => [m.text, m.local])).toEqual([['socket is down', true]])

    // A server list arriving meanwhile must not erase it.
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [] })
    })
    expect(queueOf(store)).toHaveLength(1)

    FakeWS.sendResult = true
    act(() => ws.callbacks.onReplayComplete())
    expect(ws.sent).toEqual([['user_message', 'socket is down', undefined, { queue: true }]])
    expect(queueOf(store)).toEqual([])
  })

  it('forwards an action on a held message and updates the list at once', async () => {
    const { result, store, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [held('s1', 'first'), held('s2', 'second')] })
    })

    act(() => result.current.queueOp({ op: 'remove', id: 's1' }))
    expect(ws.sent).toEqual([['queue_op', { op: 'remove', id: 's1' }]])
    expect(queueOf(store).map((m) => m.id)).toEqual(['s2'])
  })

  it('does not show a message as dropped when the action could not reach the server', async () => {
    // Showing it gone while the session still holds it would get it sent anyway.
    const { result, store, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'pending_queue', messages: [held('s1', 'still held')] })
    })

    FakeWS.sendResult = false
    act(() => result.current.queueOp({ op: 'remove', id: 's1' }))
    expect(queueOf(store).map((m) => m.id)).toEqual(['s1'])
  })

  it('edits or drops a message not handed over yet without asking the server', async () => {
    const { result, store, ws } = await setup()
    FakeWS.sendResult = false
    act(() => result.current.queueMessage('draft'))
    const id = queueOf(store)[0].id

    FakeWS.sendResult = true
    act(() => result.current.queueOp({ op: 'edit', id, content: 'final' }))
    expect(ws.sent).toEqual([])
    expect(queueOf(store).map((m) => [m.text, m.local])).toEqual([['final', true]])

    act(() => result.current.queueOp({ op: 'remove', id }))
    expect(queueOf(store)).toEqual([])
  })
})
