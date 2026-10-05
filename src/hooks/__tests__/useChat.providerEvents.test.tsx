/**
 * Provider-aware events in the LIVE reducer (`useChat`) — on the same frames
 * as the history reducer (`utils/chatAssembly.providerEvents.test.ts`): both
 * paths must build the same blocks.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.providerEvents.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { NATIVE_SYSTEM_INIT } from '@/utils/__fixtures__/systemInitFrames'
import {
  ALIASED_QUESTION_TOOL_USE,
  CLAUDE_QUESTION_TOOL_USE,
  CLAUDE_RESULT,
  FREE_RESULT,
  NATIVE_QUESTION,
  PRICED_RESULT,
  SYNTHETIC_QUESTION,
  TYPED_SESSION_ERROR,
  UNKNOWN_COST_RESULT,
  UNTYPED_SESSION_ERROR,
} from '@/utils/__fixtures__/providerEventFrames'

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

/** Blocks of the history reducer for the same frames, ids aside. */
const fromHistory = (events: unknown[]) =>
  historyEventsToMessages(events as never[])
    .flatMap((m) => m.blocks)
    .map(({ type, content, metadata }) => ({ type, content, metadata }))
const shape = (blocks: { type: string; content: string; metadata?: Record<string, unknown> }[]) =>
  blocks.map(({ type, content, metadata }) => ({ type, content, metadata }))

beforeEach(() => {
  FakeWS.instances.length = 0
  vi.clearAllMocks()
})

describe('useChat — session_error with a typed code', () => {
  it('keeps the code on the error block, exactly as the history reducer does', async () => {
    const { emit, blocks } = await setup()
    emit({ ...TYPED_SESSION_ERROR })
    const errors = blocks().filter((b) => b.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].metadata?.code).toBe('auth_required')
    expect(shape(errors)).toEqual(fromHistory([{ ...TYPED_SESSION_ERROR }]))
  })

  it('an untyped session_error keeps the block it always had', async () => {
    const { emit, blocks } = await setup()
    emit({ ...UNTYPED_SESSION_ERROR })
    const [error] = blocks().filter((b) => b.type === 'error')
    expect(error.metadata).toBeUndefined()
    expect(shape([error])).toEqual(fromHistory([{ ...UNTYPED_SESSION_ERROR }]))
  })
})

describe('useChat — questions to the user', () => {
  it('builds the same block as history for a synthetic and for a native question', async () => {
    const { emit, blocks } = await setup()
    emit({ ...SYNTHETIC_QUESTION })
    emit({ ...NATIVE_QUESTION })
    expect(shape(blocks())).toEqual(fromHistory([{ ...SYNTHETIC_QUESTION }, { ...NATIVE_QUESTION }]))
    expect(blocks()[0].metadata?.synthetic).toBe(true)
    expect(blocks()[1].metadata?.synthetic).toBeUndefined()
  })

  it('a NATIVE question is answered in-band with an input_response (Claude, unchanged)', async () => {
    const { emit, result, ws, blocks } = await setup()
    emit({ ...NATIVE_QUESTION })
    let delivered: boolean | undefined
    act(() => {
      delivered = result.current.respondInput('q-native-1', 'Postgres')
    })
    expect(delivered).toBe(true)
    expect(ws().sendInputResponse).toHaveBeenCalledWith('q-native-1', 'Postgres')
    expect(ws().sendUserMessage).not.toHaveBeenCalled()
    expect(blocks()[0].metadata).toMatchObject({ submitted: true, response: 'Postgres' })
    // No user bubble: the answer is not a turn.
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(0)
  })

  it('a SYNTHETIC question is answered by a user turn, not by an input_response', async () => {
    const { emit, result, ws, blocks } = await setup()
    emit({ ...SYNTHETIC_QUESTION })
    let delivered: boolean | undefined
    act(() => {
      delivered = result.current.respondInput('q-synth-1', 'Postgres')
    })
    expect(delivered).toBe(true)
    expect(ws().sendUserMessage).toHaveBeenCalledWith('Postgres')
    expect(ws().sendInputResponse).not.toHaveBeenCalled()
    expect(blocks()[0].metadata).toMatchObject({ submitted: true, response: 'Postgres' })
    const users = result.current.messages.filter((m) => m.role === 'user')
    expect(users).toHaveLength(1)
    expect(users[0].blocks[0].content).toBe('Postgres')
    expect(result.current.isStreaming).toBe(true)

    // The server's echo of that turn does not add a second bubble.
    emit({ type: 'user_message', content: 'Postgres' })
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('native_question: false — even an unmarked question goes back as a user turn', async () => {
    const { emit, result, ws } = await setup()
    emit({ ...NATIVE_SYSTEM_INIT }) // capabilities.native_question === false
    emit({ ...NATIVE_QUESTION })
    act(() => {
      result.current.respondInput('q-native-1', 'Neo4j')
    })
    expect(ws().sendUserMessage).toHaveBeenCalledWith('Neo4j')
    expect(ws().sendInputResponse).not.toHaveBeenCalled()
  })

  it('a dead socket leaves the synthetic question open', async () => {
    const { emit, result, ws, blocks } = await setup()
    emit({ ...SYNTHETIC_QUESTION })
    ws().sendUserMessage.mockReturnValueOnce(false)
    let delivered: boolean | undefined
    act(() => {
      delivered = result.current.respondInput('q-synth-1', 'Postgres')
    })
    expect(delivered).toBe(false)
    expect(blocks()[0].metadata?.submitted).toBeUndefined()
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(0)
  })

  it('a user turn seen on the socket answers the open synthetic question (another tab answered)', async () => {
    const { emit, blocks } = await setup()
    emit({ ...SYNTHETIC_QUESTION })
    emit({ type: 'user_message', content: 'Neo4j' })
    expect(blocks()[0].metadata).toMatchObject({ submitted: true, response: 'Neo4j' })
  })

  it.each([
    ['Claude tool name', CLAUDE_QUESTION_TOOL_USE],
    ['canonical alias', ALIASED_QUESTION_TOOL_USE],
  ])('a question tool on the stream (%s) becomes a question block, as in history', async (_label, frame) => {
    const { emit, blocks } = await setup()
    emit({ ...frame })
    const live = blocks()
    expect(live).toHaveLength(1)
    expect(live[0].type).toBe('ask_user_question')
    const history = fromHistory([{ ...frame }])
    expect(live[0].content).toBe(history[0].content)
    expect(live[0].metadata?.tool_call_id).toBe(history[0].metadata?.tool_call_id)
  })
})

describe('useChat — cost of a turn', () => {
  const cost = (m: { cost_usd?: number; cost_basis?: string; usage?: unknown }) => ({
    cost_usd: m.cost_usd,
    cost_basis: m.cost_basis,
    usage: m.usage,
  })

  it.each([
    ['a Claude result (bare cost_usd)', CLAUDE_RESULT],
    ['a free turn', FREE_RESULT],
    ['a priced turn where `cost` wins over cost_usd', PRICED_RESULT],
    ['an unknown cost', UNKNOWN_COST_RESULT],
  ])('%s is stored like the history reducer stores it', async (_label, frame) => {
    const { emit, result } = await setup()
    emit({ type: 'stream_delta', text: 'ok' })
    emit({ ...frame })
    const live = result.current.messages[result.current.messages.length - 1]
    const history = historyEventsToMessages([{ type: 'assistant_text', content: 'ok' }, { ...frame }] as never[])[0]
    expect(cost(live)).toEqual(cost(history))
  })

  it('a Claude session shows the cost it always did', async () => {
    const { emit, result } = await setup()
    emit({ type: 'stream_delta', text: 'ok' })
    emit({ ...CLAUDE_RESULT })
    const live = result.current.messages[result.current.messages.length - 1]
    expect(live.cost_usd).toBe(0.0123)
    expect(live.cost_basis).toBe('reported')
  })
})
