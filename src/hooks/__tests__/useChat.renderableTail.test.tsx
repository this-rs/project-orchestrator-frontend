/**
 * Regression test: an existing conversation must not open as a BLANK one.
 *
 * Bug (fixed in this commit): `useChat` loads only the last PAGE_SIZE (50) raw
 * events. `background_output` ticks — the progress stream of background `Task`
 * subagents — are attached to the `tool_use` block they belong to via
 * `correlation_id`, and DROPPED by chatAssembly when that parent block sits
 * outside the loaded window. A burst of long-running subagents (5 in parallel
 * for ~20 min, with no foreground turn in between) fills the entire tail with
 * them, so all 50 events assembled to nothing, `messages` stayed `[]`, and
 * ChatMessages rendered the "new conversation" welcome screen over a session
 * holding 2048 events.
 *
 * It was a dead end rather than a cosmetic glitch: the welcome screen REPLACES
 * the scroll container, so "load older" could never be reached and the history
 * was unrecoverable from the UI.
 *
 * The fix widens the tail window (end anchored, so it stays a true tail) until
 * it assembles into something renderable.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.renderableTail.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'

vi.mock('@/services', () => {
  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    sessionId: string | null = null
    status = 'disconnected'
    callbacks: Record<string, unknown> = {}
    constructor() {
      FakeChatWebSocket.instances.push(this)
    }
    setCallbacks(cb: Record<string, unknown>) {
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
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      getMessages: vi.fn(),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

const FakeWS = ChatWebSocket as unknown as { instances: unknown[] }
const getMessages = chatApi.getMessages as unknown as ReturnType<typeof vi.fn>

const TOTAL = 2048

/** One orphan subagent progress tick: its parent `tool_use` is not in the window. */
function orphanTick(seq: number) {
  return {
    type: 'background_output',
    id: `bg-${seq}`,
    seq,
    created_at: 1790424800 + seq,
    source: 'system:task_progress',
    correlation_id: 'toolu_absent_from_window',
    content: '{"description":"Running something"}',
  }
}

/**
 * Serve a session whose last `orphanCount` events are orphan ticks, immediately
 * preceded by a real exchange — the shape of the reported session. With
 * `orphanCount >= PAGE_SIZE` the exchange falls outside the plain tail window.
 */
function serveSession(orphanCount: number) {
  const lastRealSeq = TOTAL - orphanCount
  const exchange = new Map<number, unknown>([
    [
      lastRealSeq - 1,
      { type: 'user_message', id: 'u1', seq: lastRealSeq - 1, created_at: 1790294790, content: 'Ma question' },
    ],
    [
      lastRealSeq,
      { type: 'assistant_text', id: 'a1', seq: lastRealSeq, created_at: 1790294800, content: 'Ma réponse' },
    ],
  ])
  getMessages.mockImplementation(
    (_sid: string, { limit, offset }: { limit: number; offset: number }) => {
      const events: unknown[] = []
      for (let i = 0; i < limit && offset + i < TOTAL; i++) {
        const seq = offset + i + 1
        if (seq > lastRealSeq) events.push(orphanTick(seq))
        // Anything older than the exchange is an event that renders nothing,
        // so a window that misses the exchange stays blank.
        else events.push(exchange.get(seq) ?? { type: 'system_hint', id: `h-${seq}`, seq, created_at: 1 })
      }
      return Promise.resolve({ messages: events, total_count: TOTAL, has_more: true, offset })
    },
  )
}

async function openChat() {
  const store = createStore()
  store.set(chatSessionIdAtom, 'sess-1')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return rendered
}

describe('useChat (regression: a conversation whose tail renders nothing must not look new)', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it('widens the tail window past a full page of orphan background_output', async () => {
    serveSession(50) // exactly the reported case: the last 50 events are all orphans
    const { result } = await openChat()

    // The load-bearing assertion: the history renders instead of collapsing to
    // the welcome screen.
    expect(result.current.messages.length).toBeGreaterThan(0)
    const texts = result.current.messages.flatMap((m) => m.blocks).map((b) => b.content)
    expect(texts).toContain('Ma question')
    expect(texts).toContain('Ma réponse')

    // Widening keeps the END on the tail, so the window is still a true tail:
    // no phantom "newer messages" page, and live events keep appending.
    expect(result.current.hasNewerMessages).toBe(false)
    // Older events remain reachable by scrolling up.
    expect(result.current.hasOlderMessages).toBe(true)

    // It widened rather than walking backwards: some window was requested with
    // a limit larger than one page, all of them ending at the tail.
    const windows = getMessages.mock.calls
      .map((c) => c[1] as { limit: number; offset: number })
      .filter((q) => q.limit > 1)
    expect(windows.some((q) => q.limit > 50)).toBe(true)
    for (const q of windows) expect(q.offset + q.limit).toBeGreaterThanOrEqual(TOTAL)
  })

  it('does not over-fetch when the plain tail already renders', async () => {
    serveSession(0) // the tail holds the real exchange
    const { result } = await openChat()

    expect(result.current.messages.length).toBeGreaterThan(0)
    const windows = getMessages.mock.calls
      .map((c) => c[1] as { limit: number; offset: number })
      .filter((q) => q.limit > 1)
    // One page was enough: no widening.
    expect(windows).toHaveLength(1)
    expect(windows[0].limit).toBe(50)
  })
})
