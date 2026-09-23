/**
 * Regression tests for the chat stream resync bugs (duplicates + lost chunks).
 *
 * Bug (fixed in this commit): on ANY WebSocket reconnect mid-stream (zombie
 * socket, events_lagged, send on dead socket), the server's Phase 1.5b
 * snapshot re-sends the ENTIRE current stream — all structured events since
 * stream start plus a cumulative `partial_text` — flagged `replaying: true,
 * seq: 0`. `useChat.handleEvent` blind-appended those on top of the live
 * content already rendered, so the whole in-flight turn appeared TWICE.
 * Symptom: "je reçois des contenus en double".
 *
 * The fix tracks the block ids of the current in-flight stream and, when the
 * first snapshot event arrives after a reconnect, truncates them so the
 * snapshot rebuilds the turn from scratch — idempotent, and it also recovers
 * content that was missed while the socket was dead.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.resync.test.tsx
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
  callbacks: {
    onEvent: (event: Record<string, unknown>) => void
    onStatusChange: (status: string) => void
    onReplayComplete: () => void
    onResync: () => void
  }
  connectCalls: unknown[][]
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }

async function setupConnectedChat() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const rendered = renderHook(() => useChat(), { wrapper })

  // Wait for the auto-connect effect: WS connected + REST history (empty) loaded
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(chatApi.getMessages).toHaveBeenCalled()
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return { ...rendered, ws: FakeWS.instances[FakeWS.instances.length - 1] }
}

function textBlocks(result: { current: ReturnType<typeof useChat> }) {
  return result.current.messages
    .flatMap((m) => m.blocks)
    .filter((b) => b.type === 'text')
}

describe('useChat (regression: reconnect snapshot must not duplicate the in-flight turn)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it('truncates live-rendered blocks when the reconnect snapshot replays the current stream', async () => {
    const { result, ws } = await setupConnectedChat()

    // Live stream: two deltas + a tool_use rendered normally
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Hello ' })
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'world' })
      ws.callbacks.onEvent({ type: 'tool_use', tool: 'Bash', id: 't1', input: {} })
    })
    expect(textBlocks(result)).toHaveLength(1)
    expect(textBlocks(result)[0].content).toBe('Hello world')

    // Zombie socket → force reconnect. Server replays the WHOLE current
    // stream as a snapshot (replaying: true, seq: 0), INCLUDING content the
    // client missed while dead (" — suite manquée").
    act(() => {
      ws.callbacks.onStatusChange('reconnecting')
    })
    act(() => {
      ws.callbacks.onEvent({
        type: 'assistant_text',
        data: { content: 'Hello world' },
        seq: 0,
        replaying: true,
      })
      ws.callbacks.onEvent({ type: 'tool_use', data: { tool: 'Bash', id: 't1', input: {} }, seq: 0, replaying: true })
      ws.callbacks.onEvent({
        type: 'partial_text',
        content: ' — suite manquée',
        seq: 0,
        replaying: true,
      })
      ws.callbacks.onReplayComplete()
    })

    // The load-bearing assertions: the turn appears ONCE (no duplicated text,
    // no duplicated tool block), and the missed content was recovered.
    const texts = textBlocks(result)
    expect(texts.map((b) => b.content)).toEqual(['Hello world', ' — suite manquée'])
    const toolBlocks = result.current.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === 'tool_use')
    expect(toolBlocks).toHaveLength(1)
  })

  it('is idempotent across TWO consecutive reconnects (cumulative snapshots grow the block, never duplicate it)', async () => {
    const { result, ws } = await setupConnectedChat()

    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Hello' })
    })

    // partial_text is the server's CUMULATIVE unflushed buffer: each snapshot
    // is a superset of the previous one (that is what the backend actually
    // sends — see get_streaming_snapshot).
    const snapshots = ['Hello world', 'Hello world, and more']
    for (const content of snapshots) {
      act(() => {
        ws.callbacks.onStatusChange('reconnecting')
      })
      act(() => {
        ws.callbacks.onEvent({ type: 'partial_text', content, seq: 0, replaying: true })
        ws.callbacks.onReplayComplete()
      })
    }

    // One block that GREW to the latest snapshot — no duplication, no loss.
    const texts = textBlocks(result)
    expect(texts).toHaveLength(1)
    expect(texts[0].content).toBe('Hello world, and more')
  })

  it('NEVER deletes already-rendered content when a snapshot does not cover it (regression: vanishing responses)', async () => {
    const { result, ws } = await setupConnectedChat()

    // A completed-looking turn whose `result` never arrived (interrupt,
    // backend restart, dormant session...).
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Réponse précédente importante' })
    })

    // Later, a reconnect happens and the server sends a snapshot for a
    // DIFFERENT/NEW stream that does not contain the previous turn.
    act(() => {
      ws.callbacks.onStatusChange('reconnecting')
    })
    act(() => {
      ws.callbacks.onEvent({ type: 'partial_text', content: 'Nouveau tour', seq: 0, replaying: true })
      ws.callbacks.onReplayComplete()
    })

    // The load-bearing assertion: the earlier response is STILL displayed.
    const contents = textBlocks(result).map((b) => b.content)
    expect(contents).toContain('Réponse précédente importante')
    expect(contents).toContain('Nouveau tour')
  })

  it('deduplicates snapshot events against blocks already rendered (mid-stream JOIN, no reconnect)', async () => {
    const { result, ws } = await setupConnectedChat()

    // Simulate the state after a mid-stream join: part of the current turn is
    // already rendered (via REST history in the real flow — here via live
    // events, which produces identical blocks). NO 'reconnecting' status ever
    // fires, so the truncate-and-rebuild path is NOT armed: only the
    // content/id dedup can prevent duplicates.
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Hello world' })
      ws.callbacks.onEvent({ type: 'tool_use', tool: 'Bash', id: 't1', input: {} })
    })

    // The server's Phase 1.5b snapshot replays the CURRENT STREAM FROM ITS
    // START (replaying, seq 0) — including what we already have, plus the tail.
    act(() => {
      ws.callbacks.onEvent({
        type: 'assistant_text',
        data: { content: 'Hello world' },
        seq: 0,
        replaying: true,
      })
      ws.callbacks.onEvent({ type: 'tool_use', data: { tool: 'Bash', id: 't1', input: {} }, seq: 0, replaying: true })
      ws.callbacks.onEvent({
        type: 'partial_text',
        content: ' — la suite',
        seq: 0,
        replaying: true,
      })
      ws.callbacks.onReplayComplete()
    })

    // The already-rendered part appears ONCE; the tail is appended.
    const texts = textBlocks(result)
    expect(texts.map((b) => b.content)).toEqual(['Hello world', ' — la suite'])
    const toolBlocks = result.current.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === 'tool_use')
    expect(toolBlocks).toHaveLength(1)
  })

  it('does NOT truncate when the reconnect replay has no snapshot (stream ended in the gap) — Phase 1 prefix replaces the half-streamed segment', async () => {
    const { result, ws } = await setupConnectedChat()

    // Half of the segment was streamed live before the connection died
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Hello wo' })
    })

    // Reconnect: stream finished during the gap → NO seq-0 snapshot, only
    // Phase 1 replay of the persisted full segment (seq > 0) + result.
    act(() => {
      ws.callbacks.onStatusChange('reconnecting')
    })
    act(() => {
      ws.callbacks.onEvent({
        type: 'assistant_text',
        data: { content: 'Hello world, complete.' },
        seq: 42,
        replaying: true,
      })
      ws.callbacks.onEvent({ type: 'result', data: { subtype: 'success' }, seq: 43, replaying: true })
      ws.callbacks.onReplayComplete()
    })

    // One block, full text — no "half + full" duplication, no lost content.
    const texts = textBlocks(result)
    expect(texts).toHaveLength(1)
    expect(texts[0].content).toBe('Hello world, complete.')
  })

  it('reconciles across a message boundary — snapshot of a stream spanning a queued user message does not restack turn 1', async () => {
    const { result, ws } = await setupConnectedChat()

    // One CLI stream spanning TWO assistant messages: a queued mid-stream
    // user send creates the [A1, U2, A2] structure. The snapshot replays
    // since STREAM start — turn-1 events included. Before the fix, the
    // reconciliation only scanned the LAST message (A2), never matched the
    // turn-1 content living in A1, and re-appended it into A2 on EVERY
    // reconnect: "le même contenu plusieurs fois, sans dedup".
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Turn one text' })
      ws.callbacks.onEvent({ type: 'tool_use', tool: 'Bash', id: 't1', input: {} })
      ws.callbacks.onEvent({ type: 'user_message', content: 'Question 2' })
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'Turn two' })
    })

    // Two reconnects, each replaying the full snapshot since stream start.
    for (let i = 0; i < 2; i++) {
      act(() => {
        ws.callbacks.onStatusChange('reconnecting')
      })
      act(() => {
        ws.callbacks.onEvent({ type: 'assistant_text', data: { content: 'Turn one text' }, seq: 0, replaying: true })
        ws.callbacks.onEvent({ type: 'tool_use', data: { tool: 'Bash', id: 't1', input: {} }, seq: 0, replaying: true })
        ws.callbacks.onEvent({ type: 'user_message', data: { content: 'Question 2' }, seq: 0, replaying: true })
        ws.callbacks.onEvent({ type: 'partial_text', content: 'Turn two', seq: 0, replaying: true })
        ws.callbacks.onReplayComplete()
      })
    }

    const texts = textBlocks(result).map((b) => b.content)
    expect(texts.filter((t) => t.includes('Turn one text'))).toHaveLength(1)
    expect(texts.filter((t) => t.includes('Turn two'))).toHaveLength(1)
    const toolBlocks = result.current.messages.flatMap((m) => m.blocks).filter((b) => b.type === 'tool_use')
    expect(toolBlocks).toHaveLength(1)
    const userMsgs = result.current.messages.filter((m) => m.role === 'user')
    expect(userMsgs).toHaveLength(1)
  })

  it('deduplicates a replayed permission_request across reconnects while the request is pending', async () => {
    const { result, ws } = await setupConnectedChat()

    // Live permission request, still unanswered.
    act(() => {
      ws.callbacks.onEvent({ type: 'permission_request', tool: 'Bash', id: 'perm-1', input: {} })
    })

    // Every reconnect during a pending permission re-sends it via the
    // snapshot. Before the fix there was NO replay dedup on this event type.
    for (let i = 0; i < 2; i++) {
      act(() => {
        ws.callbacks.onStatusChange('reconnecting')
      })
      act(() => {
        ws.callbacks.onEvent({
          type: 'permission_request',
          data: { tool: 'Bash', id: 'perm-1', input: {} },
          seq: 0,
          replaying: true,
        })
        ws.callbacks.onReplayComplete()
      })
    }

    const permBlocks = result.current.messages
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === 'permission_request')
    expect(permBlocks).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// REST resync after a reconnect the server cannot replay
// ---------------------------------------------------------------------------
//
// Bug: useChat connects with last_event = MAX_SAFE_INTEGER and live frames
// carry seq 0, so every reconnect (tab back from background, zombie socket,
// events_lagged) got NO replay. Whatever the assistant produced while the
// socket was down never appeared — "je dois changer de conversation pour
// mettre à jour". ChatWebSocket now fires onResync and useChat reloads the
// tail from REST.

describe('useChat REST resync (onResync)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
    // clearAllMocks keeps implementations: restore the empty history so a
    // previous test's mock cannot leak into the next conversation open.
    ;(chatApi.getMessages as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      total_count: 0,
      messages: [],
    }))
  })

  const persisted = [
    { type: 'user_message', content: 'question', seq: 1 },
    { type: 'assistant_text', content: 'answer produced while the tab was hidden', seq: 2 },
    { type: 'result', seq: 3 },
  ]

  function mockHistory(events: Array<Record<string, unknown>>) {
    const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>
    getMessages.mockImplementation(async (_sid: string, opts: { limit: number; offset: number }) => ({
      total_count: events.length,
      messages: events.slice(opts.offset, opts.offset + opts.limit),
    }))
  }

  it('recovers content missed while disconnected and clears a stuck typing indicator', async () => {
    const { result, ws } = await setupConnectedChat()
    act(() => {
      ws.callbacks.onEvent({ type: 'streaming_status', is_streaming: true })
    })
    expect(result.current.isStreaming).toBe(true)

    // The whole turn — including its `result` — happened while the socket
    // was down. The reconnect replayed nothing.
    mockHistory(persisted)
    act(() => {
      ws.callbacks.onResync()
    })

    await waitFor(() => {
      expect(textBlocks(result).map((b) => b.content)).toEqual([
        'question',
        'answer produced while the tab was hidden',
      ])
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('keeps the current messages on screen while REST loads, then applies buffered live events after the history', async () => {
    const { result, ws } = await setupConnectedChat()
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'already visible' })
    })

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const history = [
      { type: 'user_message', content: 'question', seq: 1 },
      { type: 'assistant_text', content: 'already visible', seq: 2 },
    ]
    const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>
    getMessages.mockImplementation(async (_sid: string, opts: { limit: number; offset: number }) => {
      await gate
      return { total_count: history.length, messages: history.slice(opts.offset, opts.offset + opts.limit) }
    })

    act(() => {
      ws.callbacks.onResync()
    })
    // A live event lands while REST is in flight: it must be buffered, not
    // wiped by the upcoming setMessages(history).
    act(() => {
      ws.callbacks.onEvent({ type: 'stream_delta', text: 'arrived during the reload' })
    })
    // No blank screen during the reload.
    expect(textBlocks(result).map((b) => b.content)).toEqual(['already visible'])

    await act(async () => {
      release()
      await gate
    })
    await waitFor(() => {
      expect(textBlocks(result).map((b) => b.content)).toEqual([
        'question',
        // The buffered delta extends the persisted text block, exactly once.
        'already visiblearrived during the reload',
      ])
    })
  })

  it('ignores a resync while a history load is already in flight', async () => {
    const { ws } = await setupConnectedChat()
    mockHistory(persisted)
    const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>
    getMessages.mockClear()

    act(() => {
      ws.callbacks.onResync()
      ws.callbacks.onResync()
    })
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2))
    // One resync = meta + tail. The second call was a no-op.
    await new Promise((r) => setTimeout(r, 20))
    expect(getMessages).toHaveBeenCalledTimes(2)
  })

  it('discards a resync that resolves after a session switch', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-1')
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useChat(), { wrapper })
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    const ws = FakeWS.instances[FakeWS.instances.length - 1]

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>
    getMessages.mockImplementation(async (sid: string, opts: { limit: number; offset: number }) => {
      if (sid === 'sess-1') {
        await gate
        return { total_count: persisted.length, messages: persisted.slice(opts.offset, opts.offset + opts.limit) }
      }
      return { total_count: 0, messages: [] }
    })

    act(() => {
      ws.callbacks.onResync()
    })
    act(() => {
      store.set(chatSessionIdAtom, 'sess-2')
    })
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    await act(async () => {
      release()
      await gate
    })
    await new Promise((r) => setTimeout(r, 20))
    // sess-1's late history must not land in sess-2.
    expect(textBlocks(result)).toEqual([])
  })
})
