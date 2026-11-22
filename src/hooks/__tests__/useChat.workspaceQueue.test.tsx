import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createStore, Provider } from 'jotai'
import { chatDraftWorkspaceAtom, chatMessageQueuesAtom, chatSessionIdAtom } from '@/atoms'

vi.mock('@/services', () => {
  class FakeChatWebSocket {
    static instances: FakeChatWebSocket[] = []
    sessionId: string | null = null
    status = 'connected'
    callbacks: { onReplayComplete?: () => void; onFeatures?: (features: string[]) => void } = {}
    sent: unknown[][] = []
    accept = true
    constructor() { FakeChatWebSocket.instances.push(this) }
    setCallbacks(callbacks: typeof this.callbacks) { this.callbacks = callbacks }
    async connect(sid: string) { this.sessionId = sid }
    disconnect() { this.status = 'disconnected' }
    sendUserMessage(...args: unknown[]) {
      if (this.accept) this.sent.push(args)
      return this.accept
    }
    sendQueueSnapshot() { return true }
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      createSession: vi.fn(),
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, messages: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp' }),
    },
  }
})

import { ChatWebSocket, chatApi } from '@/services'
import { useChat } from '../useChat'

type FakeSocket = InstanceType<typeof ChatWebSocket> & {
  callbacks: { onReplayComplete?: () => void; onFeatures?: (features: string[]) => void }
  sent: unknown[][]
  accept: boolean
}
const sockets = ChatWebSocket as unknown as { instances: FakeSocket[] }

beforeEach(() => {
  vi.clearAllMocks()
  sockets.instances.length = 0
  localStorage.clear()
})

describe('queues while a new session opens in another workspace', () => {
  it('hands a queue to session A after the user has moved to workspace B', async () => {
    let resolveA!: (response: { session_id: string }) => void
    vi.mocked(chatApi.createSession)
      .mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve }) as never)
    const store = createStore()
    store.set(chatDraftWorkspaceAtom, 'a')
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useChat(), { wrapper })

    let pendingA!: Promise<void>
    act(() => { pendingA = result.current.sendMessage('first A', { cwd: '/a' }) })
    await waitFor(() => expect(chatApi.createSession).toHaveBeenCalledTimes(1))
    act(() => result.current.queueMessage('queued A', ['doc-a']))
    act(() => store.set(chatDraftWorkspaceAtom, 'b'))
    await act(async () => { resolveA({ session_id: 'session-a' }); await pendingA })

    expect(store.get(chatSessionIdAtom)).toBeNull()
    const background = sockets.instances.find((socket) => socket.sessionId === 'session-a')
    expect(background, 'a background socket must connect to session A').toBeDefined()
    act(() => background!.callbacks.onReplayComplete?.())
    expect(background!.sent).toEqual([['queued A', ['doc-a'], { queue: true }]])
    expect(store.get(chatMessageQueuesAtom)['session-a']).toBeUndefined()
    expect(store.get(chatSessionIdAtom)).toBeNull()
  })

  it.each(['foreground', 'background'] as const)(
    'hands each queued message over once when %s socket is ready first',
    async (first) => {
      let resolveA!: (response: { session_id: string }) => void
      vi.mocked(chatApi.createSession)
        .mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve }) as never)
      const store = createStore()
      store.set(chatDraftWorkspaceAtom, 'a')
      const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
      const { result } = renderHook(() => useChat(), { wrapper })

      let pendingA!: Promise<void>
      act(() => { pendingA = result.current.sendMessage('first A', { cwd: '/a' }) })
      await waitFor(() => expect(chatApi.createSession).toHaveBeenCalledTimes(1))
      act(() => result.current.queueMessage('queued A'))
      act(() => store.set(chatDraftWorkspaceAtom, 'b'))
      await act(async () => { resolveA({ session_id: 'session-a' }); await pendingA })
      const background = sockets.instances.find((socket) => socket.sessionId === 'session-a')
      expect(background).toBeDefined()

      await act(async () => { store.set(chatSessionIdAtom, 'session-a') })
      const foreground = sockets.instances.find((socket) => socket !== background && socket.sessionId === 'session-a')
      expect(foreground).toBeDefined()
      act(() => {
        const [one, two] = first === 'foreground' ? [foreground!, background!] : [background!, foreground!]
        one.callbacks.onReplayComplete?.()
        two.callbacks.onReplayComplete?.()
      })
      expect([...foreground!.sent, ...background!.sent]).toEqual([['queued A', undefined, { queue: true }]])
      expect(store.get(chatMessageQueuesAtom)['session-a']).toBeUndefined()
    },
  )

  it('hands A to the server without taking over B, which can start its own conversation', async () => {
    let resolveA!: (response: { session_id: string }) => void
    let resolveB!: (response: { session_id: string }) => void
    vi.mocked(chatApi.createSession)
      .mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve }) as never)
      .mockReturnValueOnce(new Promise((resolve) => { resolveB = resolve }) as never)
    const store = createStore()
    store.set(chatDraftWorkspaceAtom, 'a')
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useChat(), { wrapper })

    let pendingA!: Promise<void>
    act(() => { pendingA = result.current.sendMessage('first A', { cwd: '/a' }) })
    await waitFor(() => expect(chatApi.createSession).toHaveBeenCalledTimes(1))
    act(() => result.current.queueMessage('queued A', ['doc-a']))
    act(() => store.set(chatDraftWorkspaceAtom, 'b'))
    expect(result.current.isSending).toBe(false)
    expect(result.current.isStreaming).toBe(false)

    let pendingB!: Promise<void>
    act(() => { pendingB = result.current.sendMessage('first B', { cwd: '/b' }) })
    await waitFor(() => expect(chatApi.createSession).toHaveBeenCalledTimes(2))
    expect(result.current.isSending).toBe(true)
    await act(async () => { resolveA({ session_id: 'session-a' }); await pendingA })
    expect(result.current.isSending).toBe(true)
    expect(result.current.isStreaming).toBe(true)
    expect(store.get(chatSessionIdAtom)).toBeNull()

    const background = sockets.instances.find((socket) => socket.sessionId === 'session-a')!
    expect(background).toBeDefined()
    background.accept = false
    act(() => background.callbacks.onReplayComplete?.())
    expect(store.get(chatMessageQueuesAtom)['session-a']).toHaveLength(1)
    background.accept = true
    act(() => background.callbacks.onReplayComplete?.())
    expect(background.sent).toEqual([['queued A', ['doc-a'], { queue: true }]])
    expect(store.get(chatMessageQueuesAtom)['session-a']).toBeUndefined()
    expect(background.status).toBe('disconnected')

    await act(async () => { resolveB({ session_id: 'session-b' }); await pendingB })
    expect(store.get(chatSessionIdAtom)).toBe('session-b')
  })
})
