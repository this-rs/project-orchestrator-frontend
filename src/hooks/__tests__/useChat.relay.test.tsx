/**
 * A conversation that moves to another provider, a session the server closes, a
 * context re-injected after compaction, and the socket path of "cancel the tools" -
 * in the LIVE reducer (`useChat`), with the same blocks as the history reducer.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.relay.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatDraftInputAtom, chatDraftsMapAtom, chatFollowNoticeAtom, chatSessionIdAtom, chatSwitchingSessionAtom } from '@/atoms'
import { historyEventsToMessages } from '@/utils/chatAssembly'

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
    sendCancelTools = vi.fn(() => true)
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
    sendSetModel() {
      return true
    }
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, messages: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp', model: 'qwen' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = {
  sessionId: string | null
  status: string
  callbacks: { onEvent: (event: Record<string, unknown>) => void }
  sendCancelTools: ReturnType<typeof vi.fn>
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }

/** The frame the backend stores on BOTH threads of a move (contract example). */
const RELAYED = {
  type: 'conversation_relayed',
  from_session_id: 'sess-1',
  to_session_id: 'sess-2',
  from_provider: 'claude-code',
  to_provider: 'local',
  relayed_entries: 12,
  omitted_entries: 3,
  moved_by: 'user',
}

async function setup(sessionId = 'sess-1') {
  const store = createStore()
  store.set(chatSessionIdAtom, sessionId)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
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

const shape = (blocks: { type: string; content: string; metadata?: Record<string, unknown> }[]) =>
  blocks.map(({ type, content, metadata }) => ({ type, content, metadata }))
const fromHistory = (events: unknown[]) => shape(historyEventsToMessages(events as never[]).flatMap((m) => m.blocks))

beforeEach(() => {
  FakeWS.instances.length = 0
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useChat — a conversation moved to another provider', () => {
  it('the tab on the OLD session follows to_session_id, with a notice, and its draft goes along', async () => {
    const { result, store, emit } = await setup()
    act(() => store.set(chatDraftInputAtom, 'half a thought'))
    emit({ ...RELAYED })
    emit({ type: 'session_closed', session_id: 'sess-1', reason: 'closed' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-2'))
    expect(chatApi.getSession).toHaveBeenCalledWith('sess-2')
    expect(store.get(chatFollowNoticeAtom)).toEqual({ sessionId: 'sess-2', fromProvider: 'claude-code', toProvider: 'local', movedBy: 'user' })
    expect(store.get(chatDraftsMapAtom)).toEqual({ 'sess-2': 'half a thought' })
  })

  it('moved from THIS tab (switch in flight): follows without a notice', async () => {
    const { result, store, emit } = await setup()
    act(() => store.set(chatSwitchingSessionAtom, 'sess-1'))
    emit({ ...RELAYED })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-2'))
    expect(store.get(chatFollowNoticeAtom)).toBeNull()
  })

  it('on the NEW thread the move is stated (N replayed, M left out) and nothing moves', async () => {
    const { result, emit, blocks } = await setup('sess-2')
    emit({ ...RELAYED })
    const relayed = blocks().filter((b) => b.type === 'conversation_relayed')
    expect(relayed).toHaveLength(1)
    expect(relayed[0].metadata).toMatchObject({ relayed_entries: 12, omitted_entries: 3, to_session_id: 'sess-2' })
    expect(relayed[0].content).toContain('12')
    expect(shape(relayed)).toEqual(fromHistory([{ ...RELAYED }]))
    expect(result.current.sessionId).toBe('sess-2')
  })

  it('a replayed move is history: the tab stays where it is', async () => {
    const { result, emit, blocks } = await setup()
    emit({ ...RELAYED, replaying: true })
    expect(blocks().some((b) => b.type === 'conversation_relayed')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.sessionId).toBe('sess-1')
  })
})

describe('useChat — session_closed without a move', () => {
  it('is visible in the transcript and stops the stream; the tab stays', async () => {
    const { result, emit, blocks } = await setup()
    emit({ type: 'streaming_status', is_streaming: true })
    expect(result.current.isStreaming).toBe(true)
    emit({ type: 'session_closed', session_id: 'sess-1', reason: 'idle' })
    const closed = blocks().filter((b) => b.type === 'session_closed')
    expect(closed).toHaveLength(1)
    expect(closed[0].metadata).toEqual({ reason: 'idle' })
    expect(closed[0].content).toMatch(/idle/i)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.sessionId).toBe('sess-1')
  })
})

describe('useChat — compaction_recovery', () => {
  it('renders the re-injected context, as the history reducer does', async () => {
    const { emit, blocks } = await setup()
    const frame = { type: 'compaction_recovery', hint_tokens: 1800, build_latency_ms: 42, recovery_success: true }
    emit({ ...frame })
    const recovery = blocks().filter((b) => b.type === 'compaction_recovery')
    expect(recovery).toHaveLength(1)
    expect(recovery[0].metadata).toEqual({ hint_tokens: 1800, build_latency_ms: 42, recovery_success: true })
    expect(shape(recovery)).toEqual(fromHistory([{ ...frame }]))
  })

  it('a failed recovery says so', async () => {
    const { emit, blocks } = await setup()
    emit({ type: 'compaction_recovery', hint_tokens: 0, build_latency_ms: 9, recovery_success: false })
    const [recovery] = blocks().filter((b) => b.type === 'compaction_recovery')
    expect(recovery.metadata?.recovery_success).toBe(false)
    expect(recovery.content).toMatch(/could not be restored/i)
  })
})

describe('useChat — cancel the running tools over the socket', () => {
  it('sends the cancel_tools frame when the socket is open on this session', async () => {
    const { result, ws } = await setup()
    let sent = false
    act(() => {
      sent = result.current.cancelToolsLive()
    })
    expect(sent).toBe(true)
    expect(ws().sendCancelTools).toHaveBeenCalledTimes(1)
  })

  it('answers false on a socket that is not open, so the caller uses REST', async () => {
    const { result, ws } = await setup()
    ws().status = 'reconnecting'
    expect(result.current.cancelToolsLive()).toBe(false)
    expect(ws().sendCancelTools).not.toHaveBeenCalled()
  })
})
