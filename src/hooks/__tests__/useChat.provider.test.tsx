/**
 * The provider of a session, as the LIVE reducer (`useChat`) reads it — on the
 * same `system_init` frames as the history reducer
 * (`utils/chatAssembly.provider.test.ts`): both paths must agree.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.provider.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import {
  chatSessionIdAtom,
  chatSessionProviderAtom,
  chatSessionCapabilitiesAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionToolPolicyAtom,
} from '@/atoms'
import { CLAUDE_CODE_CAPABILITIES } from '@/types/provider'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { LEGACY_SYSTEM_INIT, NATIVE_SYSTEM_INIT } from '@/utils/__fixtures__/systemInitFrames'

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
  return { ...rendered, store, emit }
}

const initBlocks = (messages: { blocks: { type: string; metadata?: Record<string, unknown> }[] }[]) =>
  messages.flatMap((m) => m.blocks).filter((b) => b.type === 'system_init')

describe('useChat — provider and capabilities from system_init', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it('a system_init WITHOUT provider leaves a Claude Code session with the full profile', async () => {
    const { store, emit, result } = await setup()
    emit({ ...LEGACY_SYSTEM_INIT })

    expect(store.get(chatSessionProviderAtom)).toBeNull()
    expect(store.get(chatSessionCapabilitiesSnapshotAtom)).toBeNull()
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(CLAUDE_CODE_CAPABILITIES)
    // The legacy mode is read as a neutral policy.
    expect(store.get(chatSessionToolPolicyAtom)?.mode).toBe('ask')
    // Same block as the history reducer builds from the same frame.
    const live = initBlocks(result.current.messages)[0]
    const fromHistory = initBlocks(historyEventsToMessages([{ ...LEGACY_SYSTEM_INIT }] as never[]))[0]
    expect(live.metadata).toEqual(fromHistory.metadata)
    expect(live.metadata).not.toHaveProperty('provider')
  })

  it('a system_init WITH provider exposes its restricted capabilities', async () => {
    const { store, emit, result } = await setup()
    emit({ ...NATIVE_SYSTEM_INIT })

    expect(store.get(chatSessionProviderAtom)).toEqual({
      id: 'local-llama',
      kind: 'openai_compatible',
      label: 'Local llama-server',
    })
    const caps = store.get(chatSessionCapabilitiesAtom)
    expect(caps.interactive_permissions).toBe(false)
    expect(caps.images).toBe(false)
    expect(caps.set_model_live).toBe(false)
    expect(caps.native_question).toBe(false)
    expect(caps.cost).toBe('free')
    expect(store.get(chatSessionToolPolicyAtom)).toEqual({
      mode: 'ask',
      allow: [],
      deny: ['mcp__project-orchestrator__plan'],
    })

    const live = initBlocks(result.current.messages)[0]
    const fromHistory = initBlocks(historyEventsToMessages([{ ...NATIVE_SYSTEM_INIT }] as never[]))[0]
    expect(live.metadata).toEqual(fromHistory.metadata)
    expect(live.metadata?.provider).toBe('local-llama')
  })

  it('reads the capabilities of the LAST system_init, while showing a single block', async () => {
    const { store, emit, result } = await setup()
    emit({ ...NATIVE_SYSTEM_INIT })
    emit({ ...NATIVE_SYSTEM_INIT, capabilities: { ...NATIVE_SYSTEM_INIT.capabilities, images: true } })

    expect(store.get(chatSessionCapabilitiesAtom).images).toBe(true)
    expect(initBlocks(result.current.messages)).toHaveLength(1)
  })

  it('reads a replayed system_init whose payload is nested under `data`', async () => {
    const { store, emit } = await setup()
    emit({ type: 'system_init', replaying: true, seq: 3, data: { ...NATIVE_SYSTEM_INIT } })
    expect(store.get(chatSessionProviderAtom)?.id).toBe('local-llama')
  })

  it('takes the provider of an existing session from its record, and forgets it on a new conversation', async () => {
    vi.mocked(chatApi.getSession).mockResolvedValueOnce({
      cwd: '/tmp',
      model: 'qwen',
      provider_id: 'local-llama',
      provider_kind: 'openai_compatible',
      capabilities: { images: false, tools: true },
    } as never)
    const { store, result } = await setup(null)
    await act(async () => {
      await result.current.loadSession('sess-2')
    })
    await waitFor(() => expect(store.get(chatSessionProviderAtom)?.id).toBe('local-llama'))
    expect(store.get(chatSessionCapabilitiesAtom).images).toBe(false)
    expect(store.get(chatSessionCapabilitiesAtom).tools).toBe(true)

    act(() => result.current.newSession())
    expect(store.get(chatSessionProviderAtom)).toBeNull()
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(CLAUDE_CODE_CAPABILITIES)
  })

  it('a session record without provider_id (old session) stays Claude Code', async () => {
    const { store, result } = await setup(null)
    await act(async () => {
      await result.current.loadSession('sess-old')
    })
    await waitFor(() => expect(chatApi.getSession).toHaveBeenCalledWith('sess-old'))
    expect(store.get(chatSessionProviderAtom)).toBeNull()
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(CLAUDE_CODE_CAPABILITIES)
  })
})
