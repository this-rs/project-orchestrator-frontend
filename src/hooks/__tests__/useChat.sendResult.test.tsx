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
import { useChat, SCOPE_CONFIRMATION_TIMEOUT_MS } from '../useChat'

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
      ok = await result.current.respondPermission('t1', true, 'once')
    })
    expect(ok).toBe(true)
    expect(ws.permissionCalls).toEqual([
      ['t1', true, 'session'],
      ['t1', true, 'once'],
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

  it('a session decision stamps its scope and the granted rule on the request block', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p1', tool: 'Bash', input: {} })
    })
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_decision', id: 'p1', allow: true, scope: 'session', rule: 'Bash: git status' })
    })
    const block = result.current.messages.flatMap((m) => m.blocks).find((b) => b.type === 'permission_request')
    expect(block?.metadata?.decision).toBe('allowed')
    expect(block?.metadata?.decision_scope).toBe('session')
    expect(block?.metadata?.decision_rule).toBe('Bash: git status')
  })

  it('permission_scope_unsupported marks the request answered with that scope as refused, not as an error turn', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p1', tool: 'Bash', input: {} })
    })
    await act(async () => {
      await result.current.respondPermission('p1', true, 'session')
    })
    act(() => {
      ws.callbacks.onEvent({ type: 'error', message: 'refused', code: 'permission_scope_unsupported', reason: 'session' })
    })
    const blocks = result.current.messages.flatMap((m) => m.blocks)
    const block = blocks.find((b) => b.type === 'permission_request')
    expect((block?.metadata?.scope_refused as { scope: string }).scope).toBe('session')
    expect(block?.metadata?.decided).toBeFalsy()
    expect(blocks.some((b) => b.type === 'error')).toBe(false)
  })

  const permBlock = (result: { current: ReturnType<typeof useChat> }, id: string) =>
    result.current.messages
      .flatMap((m) => m.blocks)
      .find((b) => b.type === 'permission_request' && b.metadata?.tool_call_id === id)

  it('a refusal names its request: two requests answered "session", the refusal of A lands on A only (#323-1)', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'A', tool: 'Bash', input: { command: 'python x.py' } })
      ws.callbacks.onEvent({ type: 'permission_request', id: 'B', tool: 'Bash', input: { command: 'ls' } })
    })
    await act(async () => {
      await result.current.respondPermission('A', true, 'session')
      await result.current.respondPermission('B', true, 'session')
    })
    act(() => {
      ws.callbacks.onEvent({ type: 'error', message: 'refused', code: 'permission_scope_unsupported', reason: 'session', request_id: 'A' })
    })
    expect((permBlock(result, 'A')?.metadata?.scope_refused as { scope: string }).scope).toBe('session')
    expect(permBlock(result, 'B')?.metadata?.scope_refused).toBeUndefined()
    // B is still waiting for ITS answer: its decision lands on it.
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_decision', id: 'B', allow: true, scope: 'session', rule: 'Bash: ls' })
    })
    expect(permBlock(result, 'B')?.metadata?.decision_scope).toBe('session')
    expect(permBlock(result, 'A')?.metadata?.decided).toBeFalsy()
    // A refusal named by its request is never an error turn, even repeated.
    act(() => {
      ws.callbacks.onEvent({ type: 'error', message: 'refused', code: 'permission_scope_unsupported', reason: 'session', request_id: 'A' })
    })
    expect(result.current.messages.flatMap((m) => m.blocks).some((b) => b.type === 'error')).toBe(false)
  })

  it('a "session" answer that is never confirmed makes its block answerable again after the timeout, a confirmed one does not (#323-2)', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p1', tool: 'Bash', input: { command: 'ls' } })
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p2', tool: 'Bash', input: { command: 'pwd' } })
    })
    vi.useFakeTimers()
    try {
      act(() => {
        result.current.respondPermission('p1', true, 'session')
        result.current.respondPermission('p2', true, 'session')
      })
      act(() => {
        ws.callbacks.onEvent({ type: 'permission_decision', id: 'p2', allow: true, scope: 'session', rule: 'Bash: pwd' })
      })
      act(() => {
        vi.advanceTimersByTime(SCOPE_CONFIRMATION_TIMEOUT_MS - 1)
      })
      expect(permBlock(result, 'p1')?.metadata?.scope_unconfirmed).toBeUndefined()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(permBlock(result, 'p1')?.metadata?.scope_unconfirmed).toBeDefined()
      expect(permBlock(result, 'p2')?.metadata?.scope_unconfirmed).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a_forbidden_answer_is_shown_on_its_block_and_does_not_mark_it_answered (hook: routed by request_id, never an error turn)', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'A', tool: 'Bash', input: { command: 'ls' } })
      ws.callbacks.onEvent({ type: 'permission_request', id: 'B', tool: 'Bash', input: { command: 'pwd' } })
    })
    vi.useFakeTimers()
    try {
      act(() => {
        result.current.respondPermission('A', true, 'session')
      })
      act(() => {
        ws.callbacks.onEvent({ type: 'error', message: 'forbidden', code: 'permission_forbidden', reason: 'not_owner', request_id: 'A' })
      })
      const a = permBlock(result, 'A')
      expect((a?.metadata?.answer_forbidden as { reason: string }).reason).toBe('not_owner')
      expect(a?.metadata?.decided).toBeFalsy()
      expect(permBlock(result, 'B')?.metadata?.answer_forbidden).toBeUndefined()
      expect(result.current.messages.flatMap((m) => m.blocks).some((b) => b.type === 'error')).toBe(false)
      // Its wait ended with the refusal: no "unconfirmed" later.
      act(() => {
        vi.advanceTimersByTime(SCOPE_CONFIRMATION_TIMEOUT_MS * 2)
      })
      expect(permBlock(result, 'A')?.metadata?.scope_unconfirmed).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a socket lost while a "session" answer waits makes its block answerable again (#323-2)', async () => {
    const { result, ws } = await setup()
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', id: 'p1', tool: 'Bash', input: { command: 'ls' } })
    })
    await act(async () => {
      await result.current.respondPermission('p1', true, 'session')
    })
    act(() => {
      ;(ws.callbacks as { onStatusChange: (s: string) => void }).onStatusChange('reconnecting')
    })
    expect(permBlock(result, 'p1')?.metadata?.scope_unconfirmed).toBeDefined()
  })
})
