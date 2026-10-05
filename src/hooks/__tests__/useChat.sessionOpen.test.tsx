/**
 * Opening a conversation (`POST /chat/sessions`) from `useChat.sendMessage`:
 * which provider/model the request names, and what happens when it fails.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.sessionOpen.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import {
  chatDraftInputAtom,
  chatSelectedProviderAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionOpenErrorAtom,
  chatStreamingAtom,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { ApiError } from '@/services/api'
import type { ProvidersResponse } from '@/types/provider'

vi.mock('@/services', () => {
  class FakeChatWebSocket {
    setCallbacks() {}
    async connect() {}
    disconnect() {}
    send() {
      return true
    }
    sendUserMessage() {
      return true
    }
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

import { chatApi } from '@/services'
import { useChat } from '../useChat'

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] },
    {
      id: 'local-llama',
      kind: 'openai_compatible',
      label: 'Local llama-server',
      health: { status: 'healthy' },
      default_model: 'qwen2.5-coder-32b',
      models: [{ id: 'qwen2.5-coder-32b', aliases: ['fast'] }],
    },
  ],
  default: { provider: 'local-llama', routed_by: 'project_rule' },
}

function setup(prepare?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  prepare?.(store)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  return { ...rendered, store }
}

const OPTIONS = { cwd: '/repo', projectSlug: 'demo' }
const created = () => vi.mocked(chatApi.createSession).mock.calls[0][0]
const userBubbles = (messages: { role: string }[]) => messages.filter((m) => m.role === 'user')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useChat.sendMessage — a session creation that fails', () => {
  it('typed 403: stops the indicator, exposes the typed error, restores the draft, leaves no ghost bubble', async () => {
    vi.mocked(chatApi.createSession).mockRejectedValue(
      new ApiError(
        403,
        JSON.stringify({
          code: 'endpoint_not_allowed',
          error: 'Project demo may not send content to http://10.0.0.5:8080',
          origin: 'http://10.0.0.5:8080',
          project_slug: 'demo',
        }),
      ),
    )
    const { result, store } = setup()

    await act(async () => {
      // Must resolve: a rejected creation is handled here, not by the caller.
      await expect(result.current.sendMessage('explain this repo', OPTIONS, ['doc-1'])).resolves.toBeUndefined()
    })

    expect(result.current.isStreaming).toBe(false)
    expect(store.get(chatStreamingAtom)).toBe(false)
    expect(result.current.isSending).toBe(false)
    expect(result.current.sessionId).toBeNull()
    expect(userBubbles(result.current.messages)).toHaveLength(0)
    expect(store.get(chatDraftInputAtom)).toBe('explain this repo')
    const error = store.get(chatSessionOpenErrorAtom)
    expect(error?.info?.code).toBe('endpoint_not_allowed')
    expect(error?.info?.origin).toBe('http://10.0.0.5:8080')
    expect(error?.info?.status).toBe(403)
    expect(error?.message).toBe('Project demo may not send content to http://10.0.0.5:8080')
    expect(error?.text).toBe('explain this repo')
    expect(error?.attachments).toEqual(['doc-1'])
  })

  it('untyped 500: same recovery, with a generic message and no typed info', async () => {
    vi.mocked(chatApi.createSession).mockRejectedValue(new ApiError(500, 'Internal Server Error'))
    const { result, store } = setup()

    await act(async () => {
      await result.current.sendMessage('hello', OPTIONS)
    })

    expect(result.current.isStreaming).toBe(false)
    expect(userBubbles(result.current.messages)).toHaveLength(0)
    expect(store.get(chatDraftInputAtom)).toBe('hello')
    expect(store.get(chatSessionOpenErrorAtom)).toEqual({
      info: null,
      message: 'Internal Server Error',
      text: 'hello',
      attachments: [],
    })
  })

  it('keeps what was typed while the request was pending, after the restored text', async () => {
    let reject: (err: unknown) => void = () => {}
    vi.mocked(chatApi.createSession).mockReturnValue(new Promise((_, r) => (reject = r)) as never)
    const { result, store } = setup()

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.sendMessage('first', OPTIONS)
    })
    act(() => store.set(chatDraftInputAtom, 'second thought'))
    await act(async () => {
      reject(new ApiError(500, 'boom'))
      await pending
    })

    expect(store.get(chatDraftInputAtom)).toBe('first\nsecond thought')
  })

  it('clears the error on the next send, on a new conversation and when another session is loaded', async () => {
    vi.mocked(chatApi.createSession).mockRejectedValue(new ApiError(500, 'boom'))
    const { result, store } = setup()
    const fail = () =>
      act(async () => {
        await result.current.sendMessage('hello', OPTIONS)
      })

    await fail()
    expect(store.get(chatSessionOpenErrorAtom)).not.toBeNull()
    act(() => result.current.newSession())
    expect(store.get(chatSessionOpenErrorAtom)).toBeNull()

    await fail()
    expect(store.get(chatSessionOpenErrorAtom)).not.toBeNull()
    await act(async () => {
      await result.current.loadSession('sess-2')
    })
    expect(store.get(chatSessionOpenErrorAtom)).toBeNull()
    act(() => result.current.newSession())

    await fail()
    vi.mocked(chatApi.createSession).mockResolvedValue({ session_id: 'sess-3' } as never)
    await act(async () => {
      await result.current.sendMessage('again', OPTIONS)
    })
    expect(store.get(chatSessionOpenErrorAtom)).toBeNull()
    await waitFor(() => expect(store.get(chatSessionIdAtom)).toBe('sess-3'))
    // This one was sent: its bubble stays.
    expect(userBubbles(result.current.messages)).toHaveLength(1)
  })
})

describe('useChat.sendMessage — provider and model of a new session', () => {
  const ready = (store: ReturnType<typeof createStore>) => {
    store.set(providersAtom, PROVIDERS)
    store.set(providersLoadStateAtom, 'ready')
  }
  const send = async (prepare?: (store: ReturnType<typeof createStore>) => void) => {
    vi.mocked(chatApi.createSession).mockResolvedValue({ session_id: 'sess-1' } as never)
    const { result } = setup(prepare)
    await act(async () => {
      await result.current.sendMessage('hello', OPTIONS)
    })
    return created()
  }

  it('omits `provider` when nothing was picked, even though a default is displayed', async () => {
    const request = await send(ready)
    expect(request).not.toHaveProperty('provider')
  })

  it('sends `provider` when the user picked an instance the server lists', async () => {
    const request = await send((store) => {
      ready(store)
      store.set(chatSelectedProviderAtom, 'claude-code')
    })
    expect(request.provider).toBe('claude-code')
  })

  it('omits a remembered pick the server no longer lists', async () => {
    const request = await send((store) => {
      ready(store)
      store.set(chatSelectedProviderAtom, 'gone')
    })
    expect(request).not.toHaveProperty('provider')
  })

  it('omits `provider` on a backend without provider routes, whatever was remembered', async () => {
    const request = await send((store) => {
      store.set(providersLoadStateAtom, 'unsupported')
      store.set(chatSelectedProviderAtom, 'local-llama')
    })
    expect(request).not.toHaveProperty('provider')
  })

  it('sends the NAME of a picked alias as `model`', async () => {
    const request = await send((store) => {
      ready(store)
      store.set(chatSessionModelAtom, 'fast')
    })
    expect(request.model).toBe('fast')
  })

  it('sends no model when none was picked (the server default applies)', async () => {
    const request = await send(ready)
    expect(request.model).toBeUndefined()
  })
})
