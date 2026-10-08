/**
 * Findings of the adversarial review of the references in `useChat`:
 * refs_resolved bound to its own message (B2), the capability known before the
 * first socket and reset on account or server change (B4), the announcement
 * cleared (B9), a stored block read only under refs_v1 (B10).
 *
 * Run with: npx vitest run src/refs/__tests__/review/useChatReview.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import { authModeAtom, chatServerFeaturesAtom, chatSessionIdAtom, currentUserAtom, refsAnnouncementAtom } from '@/atoms'
import tokens from '@/refs/__fixtures__/tokens.json'
import type { ChatReference } from '@/refs/types'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return { ...actual, api: { ...actual.api, get: apiGet } }
})

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
import { useChat } from '@/hooks/useChat'
import { ApiError } from '@/services/api'
import { clearRefsCapability } from '@/refs/refsCapability'

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

async function setup(opts: { sessionId?: string | null; features?: string[]; authed?: boolean } = {}) {
  const store = createStore()
  // Signed in (no-auth mode), so the capability probe may run.
  if (opts.authed) store.set(authModeAtom, 'none')
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
  clearRefsCapability()
  apiGet.mockReset()
  apiGet.mockRejectedValue(new Error('network'))
  localStorage.clear()
})

describe('B2 - refs_resolved is bound to its own message', () => {
  it('the answer of A is not applied to a B sent right behind it', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => { await result.current.sendMessage(text, undefined, undefined, labeled) })
    await act(async () => { await result.current.sendMessage('autre message sans ref') })
    // server order: user_message A, refs_resolved A
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: text, seq: 1 } as never))
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', seq: 2, refs: [{ ...plan, status: 'ok', label: 'P' }, { ...task, status: 'not_found' }] } as never))
    const [a, b] = userMessages(result)
    expect(b.refs).toBeUndefined()
    expect(a.refs?.every((r) => r.resolution)).toBe(true)
  })
  it('A and B both carry refs, sent back to back: each answer goes to its own, in send order', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => { await result.current.sendMessage('A ' + text, undefined, undefined, labeled) })
    await act(async () => { await result.current.sendMessage('B ' + text, undefined, undefined, labeled) })
    const answer = (status: 'ok' | 'not_found') => ({ type: 'refs_resolved', refs: [{ ...plan, status, label: 'P' }, { ...task, status }] })
    act(() => ws.callbacks.onEvent(answer('ok') as never))
    let [a, b] = userMessages(result)
    expect(a.refs?.map((r) => r.resolution)).toEqual(['ok', 'ok'])
    expect(b.refs?.map((r) => r.resolution)).toEqual([undefined, undefined])
    act(() => ws.callbacks.onEvent(answer('not_found') as never))
    ;[a, b] = userMessages(result)
    expect(a.refs?.map((r) => r.resolution)).toEqual(['ok', 'ok'])
    expect(b.refs?.map((r) => r.resolution)).toEqual(['not_found', 'not_found'])
  })
  it('a message without refs is never marked', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    await act(async () => { await result.current.sendMessage('rien') })
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', refs: [{ ...plan, status: 'ok', label: 'P' }] } as never))
    expect(userMessages(result)[0].refs).toBeUndefined()
  })
  it('an answer that matches no message is dropped without throwing', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', seq: 2, refs: [{ ...plan, status: 'ok', label: 'P' }] } as never))
    expect(userMessages(result)).toHaveLength(0)
  })
})

describe('B4 - the capability is known before the first socket', () => {
  it('a fresh conversation carries refs on its first message', async () => {
    apiGet.mockResolvedValue({ items: [] })
    const { result, store } = await setup({ sessionId: null, authed: true })
    await waitFor(() => expect(store.get(chatServerFeaturesAtom)).toEqual(['refs_v1']))
    await act(async () => { await result.current.sendMessage(text, { cwd: '/repo' }, undefined, labeled) })
    const request = vi.mocked(chatApi.createSession).mock.calls[0][0]
    expect(request.refs?.length).toBe(2)
    expect(apiGet).toHaveBeenCalledWith('/refs/search?q=&limit=1', undefined)
  })
  it('a 404 means absent: nothing is sent', async () => {
    apiGet.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result, store } = await setup({ sessionId: null, authed: true })
    await waitFor(() => expect(store.get(chatServerFeaturesAtom)).toEqual([]))
    await act(async () => { await result.current.sendMessage(text, { cwd: '/repo' }, undefined, labeled) })
    expect(vi.mocked(chatApi.createSession).mock.calls[0][0].refs).toBeUndefined()
  })
  it('a network error means unknown: off, and never blocking', async () => {
    const { result, store } = await setup({ sessionId: null, authed: true })
    await waitFor(() => expect(apiGet).toHaveBeenCalled())
    expect(store.get(chatServerFeaturesAtom)).toBeNull()
    await act(async () => { await result.current.sendMessage(text, { cwd: '/repo' }, undefined, labeled) })
    expect(vi.mocked(chatApi.createSession).mock.calls[0][0].refs).toBeUndefined()
  })
  it('not signed in: no request at all', async () => {
    await setup({ sessionId: null })
    expect(apiGet).not.toHaveBeenCalled()
  })
  it('the socket stays the authority: its announcement is not overwritten by the probe', async () => {
    apiGet.mockResolvedValue({ items: [] })
    const { store, ws } = await setup({ authed: true })
    act(() => ws.callbacks.onFeatures(['other']))
    await waitFor(() => expect(apiGet).toHaveBeenCalled())
    expect(store.get(chatServerFeaturesAtom)).toEqual(['other'])
  })
  it('a change of account puts the flag back to unknown, then asks again for the new account', async () => {
    apiGet.mockResolvedValue({ items: [] })
    const { store } = await setup({ sessionId: null, authed: true })
    await waitFor(() => expect(store.get(chatServerFeaturesAtom)).toEqual(['refs_v1']))
    apiGet.mockRejectedValue(new Error('network'))
    act(() => store.set(currentUserAtom, { id: 'u2' } as never))
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))
    expect(store.get(chatServerFeaturesAtom)).toBeNull()
  })
  it('a disconnection drops what the socket announced', async () => {
    const { store, ws } = await setup({ authed: true })
    act(() => ws.callbacks.onFeatures(['refs_v1']))
    expect(store.get(chatServerFeaturesAtom)).toEqual(['refs_v1'])
    act(() => (ws.callbacks as unknown as { onStatusChange: (s: string) => void }).onStatusChange('disconnected'))
    expect(store.get(chatServerFeaturesAtom)).toBeNull()
  })
})

describe('B9 - the announcement does not outlive its conversation', () => {
  it('is emptied when the conversation changes', async () => {
    const { store } = await setup({ features: ['refs_v1'] })
    act(() => store.set(refsAnnouncementAtom, '1 reference unavailable: Task 3adeffc9'))
    act(() => store.set(chatSessionIdAtom, 'sess-2'))
    await waitFor(() => expect(store.get(refsAnnouncementAtom)).toBe(''))
  })
})

describe('B10 - a stored block is read only under refs_v1', () => {
  const stored = 'bonjour\n\n<po-refs>[{"kind":"plan","id":"' + plan.id + '"}]</po-refs>'
  it('without the flag the whole text stays visible, no chip', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: stored, seq: 1 } as never))
    const [m] = userMessages(result)
    expect(m.blocks[0].content).toBe(stored)
    expect(m.refs).toBeUndefined()
  })
  it('without the flag a refs_resolved changes nothing', async () => {
    const { result, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: 'x', seq: 1 } as never))
    act(() => ws.callbacks.onEvent({ type: 'refs_resolved', refs: [{ ...plan, status: 'ok', label: 'P' }] } as never))
    expect(userMessages(result)[0].refs).toBeUndefined()
  })
  it('with the flag the block is decoded', async () => {
    const { result, ws } = await setup({ features: ['refs_v1'] })
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: stored, seq: 1 } as never))
    const [m] = userMessages(result)
    expect(m.blocks[0].content).toBe('bonjour')
    expect(m.refs).toEqual([{ kind: 'plan', id: plan.id }])
  })
  it('a message shown before the flag arrived is decoded when it does', async () => {
    const { result, store, ws } = await setup()
    act(() => ws.callbacks.onEvent({ type: 'user_message', content: stored, seq: 1 } as never))
    act(() => store.set(chatServerFeaturesAtom, ['refs_v1']))
    await waitFor(() => expect(userMessages(result)[0].blocks[0].content).toBe('bonjour'))
    expect(userMessages(result)[0].refs).toEqual([{ kind: 'plan', id: plan.id }])
  })
})
