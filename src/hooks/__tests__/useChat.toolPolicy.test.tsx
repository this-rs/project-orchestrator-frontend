/**
 * Tool policy and tool hints through the LIVE reducer (`useChat`):
 * - a tool event carrying `category` / `canonical` gives the same block
 *   metadata as the history reducer (`utils/chatAssembly.toolHints.test.ts`);
 * - permission modes are read in either form and written in the form the
 *   session's provider reads.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.toolPolicy.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import {
  chatSessionIdAtom,
  chatSessionPermissionOverrideAtom,
  chatSessionProviderAtom,
  chatSessionToolPolicyAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import {
  CLAUDE_BASH_PERMISSION_REQUEST,
  CLAUDE_BASH_TOOL_USE,
  CODEX_SHELL_PERMISSION_REQUEST,
  CODEX_SHELL_TOOL_USE,
} from '@/utils/__fixtures__/toolHintFrames'

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

type FakeWs = { sentModes: string[]; callbacks: { onEvent: (event: Record<string, unknown>) => void } }
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
const blockOf = (messages: { blocks: Block[] }[], type: string) =>
  messages.flatMap((m) => m.blocks).find((b) => b.type === type)

/** Block metadata minus what legitimately differs between the two paths (a wall-clock timestamp). */
const comparable = (block: Block | undefined) => {
  const { created_at: _createdAt, ...rest } = block?.metadata ?? {}
  return rest
}

describe('useChat — tool hints from the provider adapter', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it.each([
    ['tool_use', CODEX_SHELL_TOOL_USE],
    ['permission_request', CODEX_SHELL_PERMISSION_REQUEST],
  ] as const)('%s with category/canonical: same metadata as the history reducer', async (type, frame) => {
    const { emit, result } = await setup()
    emit({ ...frame })
    const live = blockOf(result.current.messages, type)
    const fromHistory = blockOf(historyEventsToMessages([{ ...frame }] as never[]), type)
    expect(live?.metadata).toMatchObject({ tool_category: 'command', tool_canonical: 'Bash' })
    expect(comparable(live)).toEqual(comparable(fromHistory))
  })

  it.each([
    ['tool_use', CLAUDE_BASH_TOOL_USE],
    ['permission_request', CLAUDE_BASH_PERMISSION_REQUEST],
  ] as const)('a Claude Code %s gets no hint keys, on either path', async (type, frame) => {
    const { emit, result } = await setup()
    emit({ ...frame })
    const live = blockOf(result.current.messages, type)
    expect(live?.metadata).not.toHaveProperty('tool_category')
    expect(live?.metadata).not.toHaveProperty('tool_canonical')
    expect(comparable(live)).toEqual(comparable(blockOf(historyEventsToMessages([{ ...frame }] as never[]), type)))
  })

  it('keeps the hints of a tool_use replayed in a snapshot', async () => {
    const { emit, result } = await setup()
    emit({ type: 'tool_use', replaying: true, data: { ...CODEX_SHELL_TOOL_USE } })
    expect(blockOf(result.current.messages, 'tool_use')?.metadata).toMatchObject({
      tool_name: 'shell',
      tool_category: 'command',
      tool_canonical: 'Bash',
    })
  })
})

describe('useChat — permission modes on the wire', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0
    vi.clearAllMocks()
  })

  it('a Claude Code session sends the legacy string and keeps the neutral mode locally', async () => {
    const { result, store, ws } = await setup()
    store.set(providersLoadStateAtom, 'ready')
    act(() => result.current.changePermissionMode('trust'))
    act(() => result.current.changePermissionMode('auto_edits'))
    expect(ws().sentModes).toEqual(['bypassPermissions', 'acceptEdits'])
    expect(store.get(chatSessionPermissionOverrideAtom)).toBe('auto_edits')
  })

  it('a third-party session sends the neutral name once the backend exposes providers', async () => {
    const { result, store, ws } = await setup()
    act(() => store.set(chatSessionProviderAtom, { id: 'codex-1', kind: 'codex' }))
    // Providers not loaded: the backend may predate them, so it gets what it has always understood.
    act(() => result.current.changePermissionMode('plan_only'))
    act(() => store.set(providersLoadStateAtom, 'ready'))
    act(() => result.current.changePermissionMode('plan_only'))
    expect(ws().sentModes).toEqual(['plan', 'plan_only'])
  })

  it.each([
    ['bypassPermissions', 'trust'],
    ['acceptEdits', 'auto_edits'],
    ['auto', 'auto_edits'],
    ['dontAsk', 'ask'],
    ['manual', 'ask'],
    ['plan', 'plan_only'],
    ['plan_only', 'plan_only'],
  ])('permission_mode_changed "%s" is read as %s', async (mode, neutral) => {
    const { emit, store } = await setup()
    emit({ type: 'permission_mode_changed', mode })
    expect(store.get(chatSessionPermissionOverrideAtom)).toBe(neutral)
  })

  it('permission_mode_changed keeps the native mode for display and the rules already known', async () => {
    const { emit, store } = await setup()
    act(() => store.set(chatSessionToolPolicyAtom, { mode: 'ask', allow: ['Read'], deny: ['Bash(rm -rf *)'] }))
    emit({ type: 'permission_mode_changed', mode: 'auto' })
    expect(store.get(chatSessionToolPolicyAtom)).toEqual({
      mode: 'auto_edits',
      native_mode: 'auto',
      allow: ['Read'],
      deny: ['Bash(rm -rf *)'],
    })
    // A full policy on the event replaces it.
    emit({ type: 'permission_mode_changed', mode: 'default', tool_policy: { mode: 'ask', allow: [], deny: [] } })
    expect(store.get(chatSessionToolPolicyAtom)).toEqual({ mode: 'ask', allow: [], deny: [] })
  })
})
