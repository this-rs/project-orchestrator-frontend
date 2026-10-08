/**
 * References (`#kind:id`) through `useChat`: sent only toward a server that
 * announced `refs_v1`, shown as chips, re-read from the stored `<po-refs>`
 * block, completed by `refs_resolved`. Vectors: the backend's golden fixtures.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.refs.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { chatMessageQueuesAtom, chatServerFeaturesAtom, chatSessionIdAtom, refsAnnouncementAtom } from '@/atoms'
import block from '@/refs/__fixtures__/po_refs_block.json'
import resolved from '@/refs/__fixtures__/refs_resolved_event.json'
import tokens from '@/refs/__fixtures__/tokens.json'
import type { ChatReference } from '@/refs/types'

vi.mock('@/services', () => {
  type Callbacks = {
    onEvent?: (event: Record<string, unknown>) => void
    onFeatures?: (features: readonly string[]) => void
    onReplayComplete?: () => void
  }
  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    static sendResult = true
    sessionId: string | null = null
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    callbacks: Callbacks = {}
    /** The exact arguments of every sendUserMessage call. */
    userSends: unknown[][] = []
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
    }
    send() {
      return true
    }
    sendUserMessage(...args: unknown[]) {
      this.userSends.push(args)
      return FakeChatWebSocket.sendResult
    }
    sendQueueSnapshot() {}
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      createSession: vi.fn().mockResolvedValue({ session_id: 'new-sess', stream_url: '' }),
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, events: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeWs = InstanceType<typeof ChatWebSocket> & {
  callbacks: { onEvent: (e: Record<string, unknown>) => void; onFeatures: (f: readonly string[]) => void; onReplayComplete: () => void }
  userSends: unknown[][]
}
const FakeWS = ChatWebSocket as unknown as { instances: FakeWs[]; sendResult: boolean }

const plan = { kind: 'plan', id: '57cf05c9-25b6-495d-ab07-de4b11d64736' } as const
const task = { kind: 'task', id: '3adeffc9-c8b0-4e2f-a674-55bfcb293433' } as const
const text = `compare ${tokens.valid[0].token} et ${tokens.valid[1].token}`
const labeled: ChatReference[] = [
  { ...plan, label: 'Chat : références #/@' },
  { ...task, label: 'PR 1' },
]

async function setup(opts: { sessionId?: string | null; features?: string[] } = {}) {
  const store = createStore()
  const sessionId = opts.sessionId === undefined ? 'sess-1' : opts.sessionId
  if (sessionId) store.set(chatSessionIdAtom, sessionId)
  if (opts.features) store.set(chatServerFeaturesAtom, opts.features)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  await waitFor(() => {
    expect(FakeWS.instances.length).toBeGreaterThan(0)
    expect(rendered.result.current.isLoadingHistory).toBe(false)
  })
  return { ...rendered, store, ws: FakeWS.instances[FakeWS.instances.length - 1] }
}

const userMessages = (r: { current: ReturnType<typeof useChat> }) => r.current.messages.filter((m) => m.role === 'user')

beforeEach(() => {
  FakeWS.instances.length = 0
  FakeWS.sendResult = true
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useChat — the server does not announce refs_v1 (the chat is unchanged)', () => {
  it('sends the frame with NO refs argument at all, and the bubble holds no chips', async () => {
    const { result, ws } = await setup()
    await act(async () => {
      await result.current.sendMessage(text, undefined, ['doc-1'], labeled)
    })
    expect(ws.userSends).toEqual([[text, ['doc-1']]])
    expect(userMessages(result)[0].refs).toBeUndefined()
  })

  it('creates the session without a refs field', async () => {
    const { result } = await setup({ sessionId: null })
    await act(async () => {
      await result.current.sendMessage(text, { cwd: '/repo' }, undefined, labeled)
    })
    const request = vi.mocked(chatApi.createSession).mock.calls[0][0]
    expect('refs' in request).toBe(false)
  })

  it('does not hand refs to the queue either', async () => {
    const { result, store, ws } = await setup()
    act(() => result.current.queueMessage(text, undefined, labeled))
    expect(ws.userSends).toEqual([[text, undefined, { queue: true }]])
    expect(store.get(chatMessageQueuesAtom)['sess-1'] ?? []).toEqual([])
  })

  it('treats an auth_ok without features, or with unrelated ones, as an older server', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onFeatures([]))
    act(() => ws.callbacks.onFeatures(['something_else']))
    await act(async () => {
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    expect(ws.userSends[0]).toEqual([text, undefined])
  })
})

describe('useChat — refs_v1 announced', () => {
  it('learns the feature from the socket (auth_ok.features)', async () => {
    const { store, ws } = await setup()
    expect(store.get(chatServerFeaturesAtom)).toBeNull()
    act(() => ws.callbacks.onFeatures(['refs_v1']))
    expect(store.get(chatServerFeaturesAtom)).toEqual(['refs_v1'])
  })

  it('sends the pairs only (never a label), keeps the text with its tokens, and shows labeled chips at once', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    expect(ws.userSends).toEqual([[text, undefined, { refs: [plan, task] }]])
    const bubble = userMessages(result)[0]
    expect(bubble.blocks[0].content).toBe(text)
    expect(bubble.refs).toEqual(labeled)
  })

  it('sends no refs argument for a message without references', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage('bonjour', undefined, undefined, [])
    })
    expect(ws.userSends).toEqual([['bonjour', undefined]])
  })

  it('puts refs in the session creation request', async () => {
    const { result } = await setup({ sessionId: null, features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage(text, { cwd: '/repo' }, undefined, labeled)
    })
    expect(vi.mocked(chatApi.createSession).mock.calls[0][0]).toMatchObject({ message: text, refs: [plan, task] })
  })

  it('keeps the refs with a message that could not leave on a dead socket, and sends them on replay-complete', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    FakeWS.sendResult = false
    await act(async () => {
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    FakeWS.sendResult = true
    act(() => ws.callbacks.onReplayComplete())
    expect(ws.userSends.at(-1)).toEqual([text, undefined, { refs: [plan, task] }])
  })

  it('queues refs with the message and hands them over with queue: true', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    act(() => result.current.queueMessage(text, undefined, labeled))
    expect(ws.userSends).toEqual([[text, undefined, { queue: true, refs: [plan, task] }]])
  })

  it('does not duplicate the optimistic bubble when the stored message comes back with its block, and keeps the labels', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    const stored = `${text}\n\n<po-refs>${JSON.stringify([plan, task])}</po-refs>`
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: stored, seq: 1 }))
    const users = userMessages(result)
    expect(users).toHaveLength(1)
    expect(users[0].refs).toEqual(labeled)
    expect(users[0].blocks[0].content).toBe(text)
  })

  it('shows the refs of a message sent from another device (no optimistic bubble), without the block in the text', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    const c = block.cases[1]
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: c.encoded, seq: 1 }))
    const [m] = userMessages(result)
    expect(m.blocks[0].content).toBe(c.text)
    expect(m.refs).toEqual(c.refs)
  })

  it('binds refs_resolved to the last user message and announces what could not be read', async () => {
    const { result, store, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage('first', undefined, undefined, [])
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    act(() => ws.callbacks.onEvent({ ...resolved.event, seq: 2 } as never))
    const [first, second] = userMessages(result)
    expect(first.refs).toBeUndefined()
    expect(second.refs?.map((r) => [r.kind, r.resolution])).toEqual([
      ['plan', 'ok'],
      ['task', 'not_found'],
      ['rfc', 'truncated'],
      ['note', 'forbidden'],
    ])
    expect(second.refs?.[0].label).toBe('Chat : références #/@')
    const said = store.get(refsAnnouncementAtom)
    expect(said).toContain('2 references unavailable')
    expect(said).toContain('1 truncated')
  })

  it('stays silent when a replayed history carries the event, but still updates the chips', async () => {
    const { result, store, ws } = await setup({ features: ['refs_v1'] })
    const c = block.cases[1]
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: c.encoded, seq: 1 }))
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', seq: 2, replaying: true, data: { refs: resolved.event.refs } } as never))
    expect(userMessages(result)[0].refs?.[0].resolution).toBe('ok')
    expect(store.get(refsAnnouncementAtom)).toBe('')
  })

  it('says nothing when every reference was read', async () => {
    const { result, store, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => {
      await result.current.sendMessage(text, undefined, undefined, labeled)
    })
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', refs: [{ ...plan, status: 'ok', label: 'P' }] } as never))
    expect(store.get(refsAnnouncementAtom)).toBe('')
  })
})
