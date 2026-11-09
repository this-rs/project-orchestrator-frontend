/**
 * Regression: a follow-up message must leave only on the socket that serves THIS conversation,
 * once that socket is authenticated for it.
 *
 * Bug: `sendMessage` sent on the singleton socket as soon as `send()` saw it OPEN, without
 * checking `ws.sessionId` or `ws.status`. A socket still attached to another conversation, or
 * not yet authenticated for this one, received the message; its reply streamed where this view
 * does not listen, and the loading indicator spun until a reload or a conversation switch.
 *
 * Fix: the message waits in `pendingSendRef` and `ws.connect(sessionId)` attaches the socket;
 * `onReplayComplete` flushes the queue.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.attach.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'

vi.mock('@/services', () => {
  type Callbacks = {
    onEvent?: (event: Record<string, unknown>) => void
    onStatusChange?: (status: string) => void
    onReplayComplete?: () => void
    onResync?: () => void
  }

  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    sentMessages: string[] = []
    connectCalls: unknown[][] = []

    constructor() {
      FakeChatWebSocket.instances.push(this)
    }
    setCallbacks(cb: Callbacks) {
      Object.assign(this.callbacks, cb)
    }
    // Like the real socket: the session is adopted at once, authentication comes later.
    async connect(sessionId: string, ...rest: unknown[]) {
      this.connectCalls.push([sessionId, ...rest])
      this.sessionId = sessionId
      this.status = 'connecting'
    }
    disconnect() {
      this.sessionId = null
      this.status = 'disconnected'
    }
    send() {
      return true
    }
    sendUserMessage(content: string) {
      this.sentMessages.push(content)
      return true
    }
    sendQueueSnapshot() {
      return true
    }
    sendQueueOp() {
      return true
    }
    sendInterrupt() {
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
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = InstanceType<typeof ChatWebSocket> & {
  callbacks: { onReplayComplete?: () => void }
  sentMessages: string[]
  connectCalls: unknown[][]
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }

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
  return { ...rendered, ws: FakeWS.instances[FakeWS.instances.length - 1] }
}

describe('useChat (regression: a follow-up message waits for its own authenticated socket)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it('does not send on a socket still attached to another conversation, and sends once attached', async () => {
    const { result, ws } = await setup()
    ws.sessionId = 'sess-0'
    ws.status = 'connected'

    await act(async () => {
      await result.current.sendMessage('hello')
    })
    expect(ws.sentMessages).toEqual([])
    expect(ws.connectCalls.at(-1)?.[0]).toBe('sess-1')

    // The socket authenticates for this conversation and its replay completes: the queue flushes.
    ws.sessionId = 'sess-1'
    ws.status = 'connected'
    act(() => {
      ws.callbacks.onReplayComplete?.()
    })
    expect(ws.sentMessages).toEqual(['hello'])
  })

  it('does not send before the socket is authenticated for this conversation, even when it is already attached', async () => {
    const { result, ws } = await setup()
    ws.sessionId = 'sess-1'
    ws.status = 'connecting'

    await act(async () => {
      await result.current.sendMessage('hello')
    })
    expect(ws.sentMessages).toEqual([])

    ws.status = 'connected'
    act(() => {
      ws.callbacks.onReplayComplete?.()
    })
    expect(ws.sentMessages).toEqual(['hello'])
  })

  it('sends at once on an authenticated socket attached to this conversation', async () => {
    const { result, ws } = await setup()
    ws.sessionId = 'sess-1'
    ws.status = 'connected'

    await act(async () => {
      await result.current.sendMessage('hello')
    })
    expect(ws.sentMessages).toEqual(['hello'])
  })
})
