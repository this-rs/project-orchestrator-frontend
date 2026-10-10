/**
 * `tool_timing` through the LIVE reducer (`useChat`), next to the history one:
 * - a live call is stamped with the server time of its frame (#662 envelope),
 *   never the browser clock, so live and history draw the same bar even when
 *   the browser clock is off;
 * - a timing that comes before its `tool_use` (live or in a `replaying`
 *   snapshot) is kept for it; one held past the end of its turn is dropped;
 * - a timing received twice changes nothing the second time;
 * - every live row is on the server's clock (gap learnt from live frames), so a
 *   request is never drawn after its own calls;
 * - a timing whose call is on an older history page is placed when that page loads.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.toolTiming.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { buildTimeline } from '@/components/timeline/model'
import type { ChatMessage } from '@/types'

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

async function setup(sessionId: string | null = 'sess-1') {
  const store = createStore()
  if (sessionId) store.set(chatSessionIdAtom, sessionId)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
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


type Block = { type: string; metadata?: Record<string, unknown> }
const blocksOf = (messages: { blocks: Block[] }[], type: string) => messages.flatMap((m) => m.blocks).filter((b) => b.type === type)

/** Server times of the turn (seconds since the epoch, as the backend sends them). */
const T = 1_760_000_000
const use = { type: 'tool_use', id: 'toolu_1', tool: 'Bash', input: { command: 'rm -rf build' } }
const result = { type: 'tool_result', id: 'toolu_1', result: 'denied', is_error: true }
/** A denied call: no run start (the contract), the wait asked → answered, then the end. */
const timing = {
  type: 'tool_timing',
  id: 'toolu_1',
  called_at: T + 1,
  started_at: T + 1.25,
  permission_requested_at: T + 1.5,
  permission_resolved_at: T + 8,
  permission_outcome: 'denied',
  ended_at: T + 12,
}

describe('useChat — tool_timing (live)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps a live call with the server time of its frame, so a browser clock one hour ahead changes nothing', async () => {
    const { emit, result: hook } = await setup()
    // The browser clock is one hour ahead of the server's.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime((T + 3600) * 1000)
    const events = [
      { type: 'user_message', content: 'clean', created_at: T },
      { ...use, created_at: T + 1 },
      { ...result, created_at: T + 12 },
      { ...timing, created_at: T + 12.01 },
    ]
    for (const e of events.slice(1)) emit({ ...e, seq: 0 })
    const live = blocksOf(hook.current.messages, 'tool_use')[0]
    expect(live.metadata?.created_at).toBe(new Date((T + 1) * 1000).toISOString())
    expect(blocksOf(hook.current.messages, 'tool_result')[0].metadata?.duration_ms).toBe(11_000)

    // The trace draws the same call from the live messages and from the history.
    const callOf = (messages: ChatMessage[]) => {
      const item = buildTimeline({ messages, sessionId: 's' }).items.find((i) => i.id === 'toolu_1')
      return item && { startedAt: item.startedAt, endedAt: item.endedAt, durationMs: item.durationMs, run: item.run }
    }
    const fromHistory = callOf(historyEventsToMessages(events))
    expect(fromHistory).toEqual({ startedAt: (T + 1) * 1000, endedAt: (T + 12) * 1000, durationMs: 11_000, run: 'denied' })
    expect(callOf(hook.current.messages as ChatMessage[])).toEqual(fromHistory)
  })

  it('a live call whose frame has no server time keeps the browser clock, and draws no 0 ms bar out of a skew', async () => {
    const { emit, result: hook } = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime((T + 3600) * 1000)
    emit({ ...use })
    emit({ ...result })
    const { called_at: _called, ...withoutCalledAt } = timing
    emit({ ...withoutCalledAt })
    const item = buildTimeline({ messages: hook.current.messages as ChatMessage[], sessionId: 's' }).items.find((i) => i.id === 'toolu_1')
    // Browser start after the server end: no duration rather than a made-up 0 ms.
    expect(item?.durationMs).toBeUndefined()
    expect(item?.endedAt).toBeUndefined()
  })

  it('keeps a timing that comes before its tool_use, live and in a replaying snapshot', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...timing, created_at: T + 12 })
    emit({ ...use, created_at: T + 1 })
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata?.tool_timing).toMatchObject({ permission_outcome: 'denied', ended_at: T + 12 })
    // The timing on its own opened no assistant message.
    expect(hook.current.messages.filter((m) => m.role === 'assistant' && m.blocks.length === 0)).toEqual([])

    emit({ type: 'tool_timing', replaying: true, seq: 0, created_at: T + 30, data: { ...timing, id: 'toolu_2', ended_at: T + 30 } })
    emit({ type: 'tool_use', replaying: true, seq: 0, created_at: T + 20, data: { ...use, id: 'toolu_2' } })
    const second = blocksOf(hook.current.messages, 'tool_use').find((b) => b.metadata?.tool_call_id === 'toolu_2')
    expect(second?.metadata?.tool_timing).toMatchObject({ ended_at: T + 30 })
    expect(second?.metadata?.created_at).toBe(new Date((T + 20) * 1000).toISOString())
  })

  it('attaches a replayed timing to its call (replaying envelope)', async () => {
    const { emit, result: hook } = await setup()
    emit({ type: 'tool_use', replaying: true, seq: 0, created_at: T + 1, data: { ...use } })
    emit({ type: 'tool_timing', replaying: true, seq: 0, created_at: T + 12, data: { ...timing } })
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata?.tool_timing).toMatchObject({ called_at: T + 1, ended_at: T + 12 })
  })

  it('a timing received twice changes nothing the second time', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...use, created_at: T + 1 })
    emit({ ...result, created_at: T + 12 })
    emit({ ...timing })
    const once = hook.current.messages
    emit({ ...timing })
    expect(hook.current.messages.map((m) => m.blocks.length)).toEqual(once.map((m) => m.blocks.length))
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata).toEqual(blocksOf(once, 'tool_use')[0].metadata)
  })

  it('replays a timing in the flat form the backend sends (fields beside `replaying`, no `data`)', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...timing, replaying: true, seq: 0, created_at: T + 12 })
    emit({ ...use, replaying: true, seq: 0, created_at: T + 1 })
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata?.tool_timing).toMatchObject({ permission_outcome: 'denied', ended_at: T + 12 })
    emit({ ...timing, id: 'toolu_3', ended_at: T + 40, replaying: true, seq: 0, created_at: T + 40 })
    emit({ ...use, id: 'toolu_3', replaying: true, seq: 0, created_at: T + 35 })
    const third = blocksOf(hook.current.messages, 'tool_use').find((b) => b.metadata?.tool_call_id === 'toolu_3')
    expect(third?.metadata?.tool_timing).toMatchObject({ ended_at: T + 40 })
    expect(third?.metadata?.created_at).toBe(new Date((T + 35) * 1000).toISOString())
  })

  it('drops a timing still waiting for its call when the turn ends', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...timing })
    emit({ type: 'result', session_id: 's', duration_ms: 10 })
    emit({ type: 'user_message', content: 'again' })
    emit({ ...use })
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata).not.toHaveProperty('tool_timing')
  })

  it('forgets the timings it held when a reconnect rebuilds the tail from REST', async () => {
    const { emit, ws, result: hook } = await setup()
    emit({ ...timing, created_at: T + 12 })
    // A reconnect the server cannot replay: the tail comes again from REST.
    await act(async () => {
      ;(ws() as unknown as { callbacks: { onResync: () => void } }).callbacks.onResync()
    })
    await waitFor(() => expect(chatApi.getMessages).toHaveBeenCalledTimes(2))
    await act(async () => {})
    emit({ ...use, created_at: T + 20 })
    expect(blocksOf(hook.current.messages, 'tool_use')[0].metadata).not.toHaveProperty('tool_timing')
  })
})

describe('useChat — the server clock on every row (live)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a request sent from a browser one hour ahead starts on the server clock: before its calls, and its turn closes', async () => {
    const { emit, result: hook } = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime((T + 3600) * 1000)
    // A live frame of the session teaches the gap (here: the previous turn's end).
    emit({ type: 'result', session_id: 'sess-1', duration_ms: 5, created_at: T, seq: 0 })
    await act(async () => {
      await hook.current.sendMessage('clean')
    })
    emit({ ...use, created_at: T + 1, seq: 0 })
    emit({ ...result, created_at: T + 3, seq: 0 })
    emit({ type: 'assistant_text', content: 'done', created_at: T + 4, seq: 0 })
    emit({ type: 'result', session_id: 'sess-1', duration_ms: 4000, created_at: T + 4, seq: 0 })
    emit({ type: 'user_message', content: 'next', created_at: T + 10, seq: 0 })

    const { items } = buildTimeline({ messages: hook.current.messages as ChatMessage[], sessionId: 's' })
    const requests = items.filter((i) => i.kind === 'request')
    const call = items.find((i) => i.id === 'toolu_1')!
    expect(requests[0].label).toBe('clean')
    expect(requests[0].startedAt).toBe(T * 1000)
    expect(requests[0].startedAt).toBeLessThanOrEqual(call.startedAt)
    // The turn closes on the server clock: seconds, not an hour.
    expect(requests[0].durationMs).toBeGreaterThan(0)
    expect(requests[0].durationMs).toBeLessThan(10_000)
    expect(requests[1].startedAt).toBe((T + 10) * 1000)
  })

  it('the live echo of a sent message stamps it with the server time, even before any frame taught the gap', async () => {
    const { emit, result: hook } = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime((T + 3600) * 1000)
    await act(async () => {
      await hook.current.sendMessage('clean')
    })
    emit({ type: 'user_message', content: 'clean', created_at: T, seq: 0 })
    const users = hook.current.messages.filter((m) => m.role === 'user')
    expect(users).toHaveLength(1)
    expect(users[0].timestamp.getTime()).toBe(T * 1000)
  })

  it('an assistant message opened by a frame without server time is on the server clock too', async () => {
    const { emit, result: hook } = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime((T + 3600) * 1000)
    emit({ type: 'user_message', content: 'go', created_at: T, seq: 0 })
    emit({ type: 'thinking', content: 'hm' })
    const assistant = hook.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.timestamp.getTime()).toBe(T * 1000)
  })

  it('stamps a live permission request with its frame time, so it is not dated from its message start', async () => {
    const { emit, result: hook } = await setup()
    emit({ ...use, created_at: T + 1, seq: 0 })
    emit({ type: 'permission_request', id: 'ctl-1', tool: 'Bash', input: {}, tool_use_id: 'toolu_1', created_at: T + 5, seq: 0 })
    emit({ type: 'ask_user_question', tool_call_id: 'q1', questions: [{ question: 'Which?' }], created_at: T + 6, seq: 0 })
    expect(blocksOf(hook.current.messages, 'permission_request')[0].metadata?.created_at).toBe(new Date((T + 5) * 1000).toISOString())
    expect(blocksOf(hook.current.messages, 'ask_user_question')[0].metadata?.created_at).toBe(new Date((T + 6) * 1000).toISOString())
  })
})

describe('useChat — a timing on a newer page than its call', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.mocked(chatApi.getMessages).mockResolvedValue({ total_count: 0, messages: [] } as never)
  })

  it('keeps the timing of the tail page and puts it on its call when the older page is loaded', async () => {
    // 52 events: the tail page (offset 2) holds the result and the timing of a call
    // whose tool_use is in the older page (offset 0, 2 events).
    const older = [
      { type: 'user_message', content: 'build', created_at: T },
      { ...use, created_at: T + 1 },
    ]
    const filler = Array.from({ length: 46 }, (_, i) => ({ type: 'assistant_text', content: `line ${i}`, created_at: T + 13 + i }))
    const tail = [
      { ...result, is_error: false, result: 'ok', created_at: T + 9 },
      { ...timing, permission_outcome: 'allowed', run_started_at: T + 8, created_at: T + 12 },
      { type: 'result', session_id: 'sess-1', duration_ms: 12_000, created_at: T + 12.5 },
      { type: 'user_message', content: 'more', created_at: T + 13 },
      ...filler,
    ]
    const total = older.length + tail.length
    vi.mocked(chatApi.getMessages).mockImplementation(async (_sid: string, opts?: { limit?: number; offset?: number }) => {
      const offset = opts?.offset ?? 0
      const limit = opts?.limit ?? 50
      const all = [...older, ...tail]
      return { total_count: total, messages: all.slice(offset, offset + limit) } as never
    })
    const { result: hook } = await setup()
    await waitFor(() => expect(hook.current.hasOlderMessages).toBe(true))
    await act(async () => {
      await hook.current.loadOlderMessages()
    })
    const call = blocksOf(hook.current.messages, 'tool_use').find((b) => b.metadata?.tool_call_id === 'toolu_1')
    expect(call?.metadata?.tool_timing).toMatchObject({ run_started_at: T + 8, ended_at: T + 12 })
  })
})
