/**
 * Stop, as `useChat` handles it when the socket is alive but the backend does
 * not read the frame (its WS loop is busy inside another handler).
 *
 * Before the fix: `sendInterrupt()` returned true (the frame reached the
 * socket), so REST was never tried, no `result` ever came, and the composer
 * stayed on "Stopping…" for good.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.interrupt.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    /** What `sendInterrupt` returns: true = the frame reached the socket. */
    static interruptAccepted = true
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    interruptSent = 0

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
    sendInterrupt() {
      this.interruptSent += 1
      return FakeChatWebSocket.interruptAccepted
    }
    sendUserMessage() {
      return true
    }
    sendQueueOp() {
      return true
    }
    sendQueueSnapshot() {
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
      interruptSession: vi.fn().mockResolvedValue({ delivered: true, routed: 'local' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

const FakeWS = ChatWebSocket as unknown as {
  instances: Array<InstanceType<typeof ChatWebSocket> & { interruptSent: number }>
  interruptAccepted: boolean
}

/** Long enough to outlast any grace period the hook gives the socket. */
const PAST_ANY_GRACE_MS = 60_000

async function setup() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  store.set(chatStreamingAtom, true)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(chatApi.getMessages).toHaveBeenCalled()
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return { ...rendered, store }
}

describe('useChat — Stop reaches the backend or falls back to REST', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    FakeWS.interruptAccepted = true
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to REST when the socket accepted the stop but the turn is still streaming', async () => {
    const { result } = await setup()
    vi.useFakeTimers()

    act(() => {
      void result.current.interrupt()
    })
    // The frame went out, so the socket path was taken...
    expect(FakeWS.instances[FakeWS.instances.length - 1].interruptSent).toBe(1)
    // ...but nothing has come back yet: REST must not have been needed up front.
    expect(chatApi.interruptSession).not.toHaveBeenCalled()

    // The backend never reads the frame, so the turn never ends.
    await act(async () => {
      vi.advanceTimersByTime(PAST_ANY_GRACE_MS)
    })

    expect(chatApi.interruptSession).toHaveBeenCalledWith('sess-1')
  })

  it('does not call REST when the turn ends on the socket path', async () => {
    const { result, store } = await setup()
    vi.useFakeTimers()

    act(() => {
      void result.current.interrupt()
    })
    // The backend answered: the stream stopped before the grace period ended.
    act(() => {
      store.set(chatStreamingAtom, false)
    })
    await act(async () => {
      vi.advanceTimersByTime(PAST_ANY_GRACE_MS)
    })

    expect(chatApi.interruptSession).not.toHaveBeenCalled()
  })

  it('uses REST at once when the socket cannot take the frame', async () => {
    FakeWS.interruptAccepted = false
    const { result } = await setup()

    await act(async () => {
      await result.current.interrupt()
    })

    expect(chatApi.interruptSession).toHaveBeenCalledWith('sess-1')
  })
})
