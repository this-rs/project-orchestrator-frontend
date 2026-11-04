/**
 * `chatVaultWaitAtom` — the composer's "vault locked, waiting since …" state.
 *
 * Live `credentials_locked` notice lights it; `model_recovered`, a live
 * `result` and an interrupt clear it; a notice REPLAYED from history never
 * lights it (no false "waiting" after a reload).
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.vaultWait.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom, chatVaultWaitAtom } from '@/atoms'

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
  const blocks = () => rendered.result.current.messages.flatMap((m) => m.blocks)
  return { ...rendered, store, emit, ws, blocks }
}

const LOCKED = {
  type: 'provider_notice',
  kind: 'credentials_locked',
  code: 'credentials_locked',
  message: 'Coffre verrouillé',
  severity: 'action_required',
}
const RECOVERED = { type: 'provider_notice', kind: 'model_recovered', message: 'ok', severity: 'latency' }

describe('chatVaultWaitAtom', () => {
  it('a live credentials_locked notice lights the wait, tagged with its session', async () => {
    const { emit, store } = await setup()
    expect(store.get(chatVaultWaitAtom)).toBeNull()
    await emit(LOCKED)
    const wait = store.get(chatVaultWaitAtom)
    expect(wait?.sessionId).toBe('sess-1')
    expect(typeof wait?.since).toBe('number')
  })

  it('a REPLAYED notice never lights it', async () => {
    const { emit, store } = await setup()
    await emit({ ...LOCKED, replaying: true })
    await emit({ type: 'provider_notice', replaying: true, data: LOCKED })
    expect(store.get(chatVaultWaitAtom)).toBeNull()
  })

  it('model_recovered clears it', async () => {
    const { emit, store } = await setup()
    await emit(LOCKED)
    await emit(RECOVERED)
    expect(store.get(chatVaultWaitAtom)).toBeNull()
  })

  it('a live result clears it, a replayed result does not', async () => {
    const { emit, store } = await setup()
    await emit(LOCKED)
    await emit({ type: 'result', replaying: true, subtype: 'success', result: 'x' })
    expect(store.get(chatVaultWaitAtom)).not.toBeNull()
    await emit({ type: 'result', subtype: 'success', result: 'x' })
    expect(store.get(chatVaultWaitAtom)).toBeNull()
  })

  it('an interrupt clears it', async () => {
    const { emit, store, result } = await setup()
    await emit(LOCKED)
    await act(async () => {
      await result.current.interrupt()
    })
    expect(store.get(chatVaultWaitAtom)).toBeNull()
  })
})
