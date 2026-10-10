/**
 * Regression: responses sent over a dead socket must not be treated as delivered.
 *
 * `ChatWebSocket.send()` returns false (and schedules a reconnect) when the
 * socket is not open. `respondPermission`, `respondInput` and `sendContinue`
 * used to ignore that and apply their optimistic local effects anyway.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.sendResult.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom, chatStreamingAtom } from '@/atoms'

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
    sendUserMessage() {
      return FakeChatWebSocket.sendResult
    }
    sendInterrupt() {
      return true
    }
    permissionCalls: unknown[][] = []
    sendPermissionResponse(...args: unknown[]) {
      this.permissionCalls.push(args)
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
  callbacks: { onEvent: (event: Record<string, unknown>) => void }
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

const askBlock = (result: { current: ReturnType<typeof useChat> }) =>
  result.current.messages.flatMap((m) => m.blocks).find((b) => b.type === 'ask_user_question')

describe('useChat (regression: a failed ws.send must not apply optimistic effects)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    FakeWS.sendResult = true
    vi.clearAllMocks()
  })

  it('respondInput does not mark the question submitted when send fails, and does when it succeeds', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'ask_user_question', tool_call_id: 'q1', questions: [{ question: 'Q?' }] })
    })
    expect(askBlock(result)).toBeDefined()

    FakeWS.sendResult = false
    let ok: boolean | void = true
    await act(async () => {
      ok = await result.current.respondInput('q1', 'yes')
    })
    expect(ok).toBe(false)
    expect(askBlock(result)?.metadata?.submitted).not.toBe(true)

    FakeWS.sendResult = true
    await act(async () => {
      ok = await result.current.respondInput('q1', 'yes')
    })
    expect(ok).toBe(true)
    expect(askBlock(result)?.metadata?.submitted).toBe(true)
  })

  it('respondPermission hands the scope to the socket and reports a failed send', async () => {
    const { result, ws } = await setup()
    FakeWS.sendResult = false
    let ok: boolean | void = true
    await act(async () => {
      ok = await result.current.respondPermission('t1', true, 'session')
    })
    expect(ok).toBe(false)

    FakeWS.sendResult = true
    await act(async () => {
      ok = await result.current.respondPermission('t1', true, 'always')
    })
    expect(ok).toBe(true)
    expect(ws.permissionCalls).toEqual([
      ['t1', true, 'session'],
      ['t1', true, 'always'],
    ])
  })

  it('sendContinue does not flip isStreaming when send fails, and does when it succeeds', async () => {
    const { result, store } = await setup()
    expect(store.get(chatStreamingAtom)).toBe(false)

    FakeWS.sendResult = false
    act(() => {
      result.current.sendContinue()
    })
    expect(store.get(chatStreamingAtom)).toBe(false)

    await new Promise((r) => setTimeout(r, 350)) // past the 300ms debounce
    FakeWS.sendResult = true
    act(() => {
      result.current.sendContinue()
    })
    expect(store.get(chatStreamingAtom)).toBe(true)
  })

  it('a decision that outlives the call stamps its scope on the request block', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p1', tool: 'Bash', input: {} })
    })
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_decision', id: 'p1', allow: true, scope: 'always' })
    })
    const block = result.current.messages.flatMap((m) => m.blocks).find((b) => b.type === 'permission_request')
    expect(block?.metadata?.decision).toBe('allowed')
    expect(block?.metadata?.decision_scope).toBe('always')
  })
})
