/**
 * `chatModelWaitAtom` — the composer's "the model did not answer, retrying …" state.
 *
 * A live `model_retry` notice (severity `latency`) lights it, tagged with its session
 * and carrying the backend's sentence; `model_recovered`, a live `result` and an
 * interrupt clear it; a notice REPLAYED from history never lights it (no false
 * "waiting" after a reload).
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.modelWait.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom, chatModelWaitAtom } from '@/atoms'

vi.mock('@/services', () => {
  type Callbacks = { onEvent?: (event: Record<string, unknown>) => void }
  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    sendUserMessage = vi.fn(() => true)
    sendInputResponse = vi.fn(() => true)
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
    sendQueueOp() {
      return true
    }
    sendInterrupt() {
      return true
    }
    sendPermissionResponse() {
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
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, messages: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp', model: 'claude-sonnet-4-5' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = {
  callbacks: { onEvent: (event: Record<string, unknown>) => void }
  sendUserMessage: ReturnType<typeof vi.fn>
  sendInputResponse: ReturnType<typeof vi.fn>
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }

async function setup() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(chatApi.getMessages).toHaveBeenCalled()
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  const ws = () => FakeWS.instances[FakeWS.instances.length - 1]
  const emit = (event: Record<string, unknown>) =>
    act(() => {
      ws().callbacks.onEvent(event)
    })
  return { ...rendered, store, emit, ws }
}

const RETRY_MSG = 'The model did not answer (attempt 2 of 5): trying again in 2 s.'
const RETRY = {
  type: 'provider_notice',
  kind: 'model_retry',
  code: 'model_retry',
  message: RETRY_MSG,
  severity: 'latency',
}
const RECOVERED = { type: 'provider_notice', kind: 'model_recovered', message: 'ok', severity: 'latency' }

describe('chatModelWaitAtom', () => {
  it('a live model_retry notice lights the wait, tagged with its session and the backend sentence', async () => {
    const { emit, store } = await setup()
    expect(store.get(chatModelWaitAtom)).toBeNull()
    await emit(RETRY)
    const wait = store.get(chatModelWaitAtom)
    expect(wait?.sessionId).toBe('sess-1')
    expect(wait?.message).toBe(RETRY_MSG)
    expect(typeof wait?.since).toBe('number')
  })

  it('a REPLAYED notice never lights it', async () => {
    const { emit, store } = await setup()
    await emit({ ...RETRY, replaying: true })
    await emit({ type: 'provider_notice', replaying: true, data: RETRY })
    expect(store.get(chatModelWaitAtom)).toBeNull()
  })

  it('model_recovered clears it', async () => {
    const { emit, store } = await setup()
    await emit(RETRY)
    await emit(RECOVERED)
    expect(store.get(chatModelWaitAtom)).toBeNull()
  })

  it('a live result clears it, a replayed result does not', async () => {
    const { emit, store } = await setup()
    await emit(RETRY)
    await emit({ type: 'result', replaying: true, subtype: 'success', result: 'x' })
    expect(store.get(chatModelWaitAtom)).not.toBeNull()
    await emit({ type: 'result', subtype: 'success', result: 'x' })
    expect(store.get(chatModelWaitAtom)).toBeNull()
  })

  it('an interrupt clears it', async () => {
    const { emit, store, result } = await setup()
    await emit(RETRY)
    await act(async () => {
      await result.current.interrupt()
    })
    expect(store.get(chatModelWaitAtom)).toBeNull()
  })
})
