/**
 * A turn the user stopped: the Claude Code CLI ends it with
 * `error_during_execution`, an empty text and `stop_reason: "interrupted"` on
 * the live stream, while the stored copy says `subtype: "interrupted"` (backend
 * #715). Neither view may show an empty error block, and a real execution error
 * still shows one.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.interruptedTurn.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'
import { historyEventsToMessages } from '@/utils/chatAssembly'

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
    sendUserMessage() {
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
    sendInputResponse() {
      return true
    }
    sentModes: string[] = []
    sendSetPermissionMode(mode: string) {
      this.sentModes.push(mode)
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
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, messages: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp', model: 'claude-sonnet-4-5' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = { callbacks: { onEvent: (event: Record<string, unknown>) => void } }
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }

async function setup(sessionId: string | null = 'sess-1', opts: { strict?: boolean } = {}) {
  const store = createStore()
  if (sessionId) store.set(chatSessionIdAtom, sessionId)
  // StrictMode is a guard only: under React 19 it does not replay these updaters
  // in a way a test can observe. The purity of the timing updaters is proven by
  // the `placeTimings` tests (same result twice, and after the holder is emptied).
  const wrapper = ({ children }: { children: ReactNode }) =>
    opts.strict ? <StrictMode><Provider store={store}>{children}</Provider></StrictMode> : <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  if (sessionId) {
    await waitFor(() => {
      expect(FakeWS.instances.length).toBeGreaterThan(0)
      expect(chatApi.getMessages).toHaveBeenCalled()
      expect(rendered.result.current.isLoadingHistory).toBe(false)
    })
  }
  const emit = (event: Record<string, unknown>) =>
    act(() => {
      FakeWS.instances[FakeWS.instances.length - 1].callbacks.onEvent(event)
    })
  const ws = () => FakeWS.instances[FakeWS.instances.length - 1]
  return { ...rendered, store, emit, ws }
}

type Block = { type: string }
const errorBlocks = (messages: { blocks: Block[] }[]) => messages.flatMap((m) => m.blocks).filter((b) => b.type === 'result_error')

const T = 1_760_000_000
const use = { type: 'tool_use', id: 'toolu_1', tool: 'Bash', input: { command: 'sleep 60' } }
const stoppedLive = { type: 'result', subtype: 'error_during_execution', is_error: true, result_text: '', stop_reason: 'interrupted', duration_ms: 4200 }
const stoppedStored = { type: 'result', subtype: 'interrupted', is_error: false, stop_reason: 'interrupted', duration_ms: 4200 }
const realError = { type: 'result', subtype: 'error_during_execution', is_error: true, result_text: 'API Error: 500' }

describe('a stopped turn shows no error block', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('live: a stop reported as error_during_execution with stop_reason interrupted adds no error block', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...use, seq: 0, created_at: T + 1 })
    emit({ ...stoppedLive, seq: 0, created_at: T + 5 })
    expect(errorBlocks(hook.current.messages)).toEqual([])
    expect(hook.current.isStreaming).toBe(false)
  })

  it('live: a real execution error still shows its block', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...use, seq: 0, created_at: T + 1 })
    emit({ ...realError, seq: 0, created_at: T + 5 })
    expect(errorBlocks(hook.current.messages)).toHaveLength(1)
  })

  it('history: neither the stored form nor an older live-shaped copy shows an error block; a real error does', () => {
    const turn = (end: Record<string, unknown>) => [
      { type: 'user_message', content: 'wait', created_at: T },
      { ...use, created_at: T + 1 },
      { ...end, created_at: T + 5 },
    ]
    expect(errorBlocks(historyEventsToMessages(turn(stoppedStored)))).toEqual([])
    expect(errorBlocks(historyEventsToMessages(turn(stoppedLive)))).toEqual([])
    expect(errorBlocks(historyEventsToMessages(turn(realError)))).toHaveLength(1)
  })
})
