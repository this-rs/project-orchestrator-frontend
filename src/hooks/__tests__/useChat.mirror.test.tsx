/**
 * The read-only mirror of a Claude Code sub-agent (P18c) on the REAL `useChat`:
 * - `mirror_of` from `getSession` lands in `sessionMeta.mirrorOf`, and leaving
 *   the mirror for a normal session never carries it over — not even when the
 *   mirror's record answers AFTER the normal one's (late response);
 * - the live `{"type":"error","code":"mirror_read_only"}` frame keeps its typed
 *   error, so the transcript renders the refusal's card.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.mirror.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatSessionIdAtom } from '@/atoms'
import type { ChatSession } from '@/types'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'

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

type FakeWs = { callbacks: { onEvent: (event: Record<string, unknown>) => void } }
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[] }
const getSession = chatApi.getSession as unknown as ReturnType<typeof vi.fn>

const record = (id: string, over: Partial<ChatSession> = {}) =>
  ({ id, cwd: '/repo', model: 'claude-sonnet', ...over }) as ChatSession
const MIRROR = record('mirror-1', {
  mirror_of: 'claude_code',
  spawned_by: { type: 'conversation', parent_session_id: 'parent-1', tool_use_id: 'toolu_1' },
})
const NORMAL = record('normal-1')

/** A `getSession` answer the test releases when it wants. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function setup(initial: string | null = null) {
  const store = createStore()
  store.set(chatSessionIdAtom, initial)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return { store, ...renderHook(() => useChat(), { wrapper }) }
}

beforeEach(() => {
  FakeWS.instances.length = 0
  vi.clearAllMocks()
})

describe('useChat — mirror_of in sessionMeta', () => {
  it('a mirror\'s record makes the session read-only; a normal session opened next is not', async () => {
    getSession.mockImplementation((id: string) => Promise.resolve(id === 'mirror-1' ? MIRROR : NORMAL))
    const { result } = setup()
    await act(async () => { await result.current.loadSession('mirror-1') })
    await waitFor(() => expect(result.current.sessionMeta?.mirrorOf).toBe('claude_code'))

    const pending = deferred<ChatSession>()
    getSession.mockImplementation(() => pending.promise)
    await act(async () => { await result.current.loadSession('normal-1') })
    // While the normal session's record loads, the mirror's read-only state is already gone.
    expect(result.current.sessionMeta?.mirrorOf ?? null).toBeNull()
    await act(async () => { pending.resolve(NORMAL) })
    await waitFor(() => expect(result.current.sessionMeta?.spawnedBy).toBeNull())
    expect(result.current.sessionMeta?.mirrorOf ?? null).toBeNull()
  })

  it('a late answer for the mirror left behind never makes the normal session read-only', async () => {
    const mirror = deferred<ChatSession>()
    const normal = deferred<ChatSession>()
    getSession.mockImplementation((id: string) => (id === 'mirror-1' ? mirror.promise : normal.promise))
    const { result, store } = setup()

    await act(async () => { await result.current.loadSession('mirror-1') })
    await act(async () => { await result.current.loadSession('normal-1') })
    // The normal session answers first, then the mirror's slow record arrives.
    await act(async () => { normal.resolve(NORMAL) })
    await waitFor(() => expect(result.current.sessionMeta).not.toBeNull())
    await act(async () => { mirror.resolve(MIRROR) })

    expect(store.get(chatSessionIdAtom)).toBe('normal-1')
    expect(result.current.sessionMeta?.mirrorOf ?? null).toBeNull()
    expect(result.current.sessionMeta?.spawnedBy ?? null).toBeNull()
  })

  it('a late failure for the session left behind clears nothing', async () => {
    let failMirror!: (e: unknown) => void
    const mirrorFails = new Promise<ChatSession>((_, reject) => { failMirror = reject })
    getSession.mockImplementation((id: string) => (id === 'mirror-1' ? mirrorFails : Promise.resolve(NORMAL)))
    const { result } = setup()
    await act(async () => { await result.current.loadSession('mirror-1') })
    await act(async () => { await result.current.loadSession('normal-1') })
    await waitFor(() => expect(result.current.sessionMeta?.cwd).toBe('/repo'))
    await act(async () => { failMirror(new Error('timeout')) })
    expect(result.current.sessionMeta?.cwd).toBe('/repo')
  })
})

describe('useChat — the live mirror_read_only frame', () => {
  it('keeps the typed refusal, and the bubble renders its card', async () => {
    getSession.mockResolvedValue(MIRROR)
    const { result, store } = setup('mirror-1')
    await waitFor(() => {
      expect(FakeWS.instances.length).toBeGreaterThan(0)
      expect(result.current.isLoadingHistory).toBe(false)
    })
    const ws = FakeWS.instances[FakeWS.instances.length - 1]
    act(() => {
      ws.callbacks.onEvent({ type: 'error', code: 'mirror_read_only', message: 'this session is a read-only mirror of a Claude Code sub-agent' })
    })
    const message = result.current.messages.find((m) => m.blocks.some((b) => b.type === 'error'))!
    const error = message.blocks.find((b) => b.type === 'error')!
    expect(error.metadata).toMatchObject({ code: 'mirror_read_only', provider_error: { code: 'mirror_read_only' } })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <ChatMessageBubble message={message} onRespondPermission={vi.fn()} onRespondInput={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    )
    const card = screen.getByRole('alert')
    expect(card.getAttribute('data-error-code')).toBe('mirror_read_only')
    expect(card).toHaveTextContent('This conversation is read-only')
  })
})
