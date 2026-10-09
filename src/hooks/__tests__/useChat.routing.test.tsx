/**
 * What `useChat.createSession` sends, by routing mode: `primary` unchanged,
 * `full` (and the `mixed` pilot) neither provider nor model, the Advanced
 * path explicit.
 *
 * Run with: npx vitest run src/hooks/__tests__/useChat.routing.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'
import {
  chatDraftAutoAtom,
  chatDraftSelectionAtom,
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
  chatSessionRoutingAtom,
  providersAtom,
  providersLoadStateAtom,
  routingSettingsAtom,
} from '@/atoms'
import type { ProviderRoutingMode, RoutingSettingsResponse } from '@/types/routing'
import type { ProvidersResponse } from '@/types/provider'

vi.mock('@/services', () => {
  class FakeChatWebSocket {
    status = 'disconnected'
    lastEventSeq = 0
    isReplaying = false
    setCallbacks() {}
    async connect() {}
    disconnect() {}
    send() { return true }
    sendUserMessage() { return true }
  }
  return {
    ChatWebSocket: FakeChatWebSocket,
    chatApi: {
      createSession: vi.fn().mockResolvedValue({ session_id: 'new-1', stream_url: '' }),
      getMessages: vi.fn().mockResolvedValue({ total_count: 0, messages: [] }),
      getBackgroundTasks: vi.fn().mockResolvedValue({ tasks: [] }),
      getSession: vi.fn().mockResolvedValue({ cwd: '/tmp', routed_by: 'auto', route_reason: 'cheapest capable' }),
    },
  }
})
vi.mock('@/services/routing', () => ({ routingApi: { get: vi.fn(), getProject: vi.fn() } }))

import { chatApi } from '@/services'
import { useChat } from '../useChat'

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] },
    { id: 'local-llama', kind: 'openai_compatible', label: 'Local', health: { status: 'healthy' }, models: [{ id: 'qwen' }] },
  ],
  default: { provider: 'claude-code', model: null, routed_by: 'default' },
}

const settings = (mode: ProviderRoutingMode): RoutingSettingsResponse => ({
  mode, stage: 'auto', primary: null, exploration_epsilon: 0, cost_weight: 0, latency_weight: 0, demote_after: 0, scope: 'global',
})

function setup(mode: ProviderRoutingMode) {
  const store = createStore()
  store.set(providersAtom, PROVIDERS)
  store.set(providersLoadStateAtom, 'ready')
  store.set(routingSettingsAtom(''), { state: 'ready', settings: settings(mode) })
  // A previous pick, remembered across reloads.
  store.set(chatSelectedProviderAtom, 'local-llama')
  store.set(chatSessionModelAtom, 'qwen')
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const rendered = renderHook(() => useChat(), { wrapper })
  return { ...rendered, store }
}

const send = async (r: ReturnType<typeof setup>) => {
  await act(async () => {
    await r.result.current.sendMessage('hello', { cwd: '/tmp' })
  })
  expect(chatApi.createSession).toHaveBeenCalledTimes(1)
  return (chatApi.createSession as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
}

describe('useChat.createSession — routing mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('router present, nothing picked in the menu: the remembered pick is not sent, the settings decide', async () => {
    const body = await send(setup('primary'))
    expect(body).not.toHaveProperty('provider')
    expect(body.model).toBeUndefined()
    expect(body).not.toHaveProperty('routing_mode')
  })

  it('one model ticked = strict: that provider and model go out', async () => {
    const r = setup('full')
    act(() => {
      r.store.set(chatDraftAutoAtom, false)
      r.store.set(chatDraftSelectionAtom, [{ provider: 'local-llama', model: 'qwen' }])
    })
    const body = await send(r)
    expect(body.routing_mode).toBe('primary')
    expect(body.provider).toBe('local-llama')
    expect(body.model).toBe('qwen')
    expect(body).not.toHaveProperty('routing_pool')
  })

  it('several models ticked = mixed: the pilot and the pool go out, an alias as the model it stands for', async () => {
    const r = setup('primary')
    act(() => {
      r.store.set(chatDraftAutoAtom, false)
      r.store.set(chatDraftSelectionAtom, [
        { provider: 'local-llama', model: 'qwen' },
        { provider: 'claude-code', model: 'claude-opus-5' },
      ])
    })
    const body = await send(r)
    expect(body.routing_mode).toBe('mixed')
    expect(body.routing_pool).toEqual([
      { provider: 'local-llama', model: 'qwen' },
      { provider: 'claude-code', model: 'claude-opus-5' },
    ])
    // The pilot is the first ticked model (the server no longer pins it when a pool is given).
    expect(body.provider).toBe('local-llama')
  })

  it('mixed: an alias goes out as its model, and an alias next to that model counts once', async () => {
    const r = setup('primary')
    act(() => {
      r.store.set(providersAtom, { ...PROVIDERS, aliases: [{ alias: 'fast', provider: 'local-llama', model: 'qwen' }] } as ProvidersResponse)
      r.store.set(chatDraftAutoAtom, false)
      r.store.set(chatDraftSelectionAtom, [
        { provider: 'local-llama', model: 'fast' },
        { provider: 'local-llama', model: 'qwen' },
        { provider: 'claude-code', model: 'claude-opus-5' },
      ])
    })
    const body = await send(r)
    expect(body.routing_mode).toBe('mixed')
    expect(body.routing_pool).toEqual([
      { provider: 'local-llama', model: 'qwen' },
      { provider: 'claude-code', model: 'claude-opus-5' },
    ])
  })

  it('an alias and its model only: ONE model, strict, no pool', async () => {
    const r = setup('full')
    act(() => {
      r.store.set(providersAtom, { ...PROVIDERS, aliases: [{ alias: 'fast', provider: 'local-llama', model: 'qwen' }] } as ProvidersResponse)
      r.store.set(chatDraftAutoAtom, false)
      r.store.set(chatDraftSelectionAtom, [
        { provider: 'local-llama', model: 'qwen' },
        { provider: 'local-llama', model: 'fast' },
      ])
    })
    const body = await send(r)
    expect(body.routing_mode).toBe('primary')
    expect(body).not.toHaveProperty('routing_pool')
  })

  it('a conversation opened on the settings keeps their mode, even if the settings change afterwards', async () => {
    const r = setup('full')
    await send(r)
    act(() => r.store.set(routingSettingsAtom(''), { state: 'ready', settings: settings('primary') }))
    await waitFor(() => expect(r.store.get(chatSessionRoutingAtom)?.routing_mode).toBe('full'))
    expect(r.store.get(chatRoutingModeAtom)).toBe('full')
  })

  it('Auto: routing_mode full and nothing named, whatever was ticked', async () => {
    const r = setup('primary')
    act(() => {
      r.store.set(chatDraftAutoAtom, true)
      r.store.set(chatDraftSelectionAtom, [{ provider: 'local-llama', model: 'qwen' }])
    })
    const body = await send(r)
    expect(body.routing_mode).toBe('full')
    expect(body).not.toHaveProperty('provider')
    expect(body.model).toBeUndefined()
  })

  it('full: sends neither provider nor model, even with a remembered pick', async () => {
    const body = await send(setup('full'))
    expect(body).not.toHaveProperty('provider')
    expect(body.model).toBeUndefined()
  })

  it('mixed: the pilot is not named either', async () => {
    const body = await send(setup('mixed'))
    expect(body).not.toHaveProperty('provider')
    expect(body.model).toBeUndefined()
  })

  it('full + advanced: the forced provider and model are sent', async () => {
    const r = setup('full')
    act(() => r.store.set(chatForcedTargetAtom, true))
    const body = await send(r)
    expect(body.provider).toBe('local-llama')
    expect(body.model).toBe('qwen')
    // The force belonged to that conversation.
    await waitFor(() => expect(r.store.get(chatForcedTargetAtom)).toBe(false))
  })

  it('no router on this server: the remembered pick is sent, as before', async () => {
    const r = setup('primary')
    r.store.set(routingSettingsAtom(''), { state: 'unsupported', settings: null })
    const body = await send(r)
    expect(body.provider).toBe('local-llama')
  })

  it('full: the routed_by and reason of the new session are read from its record', async () => {
    const r = setup('full')
    await send(r)
    await waitFor(() =>
      // A record that does not echo the mode keeps the one the chat was opened with (the settings' here).
      expect(r.store.get(chatSessionRoutingAtom)).toEqual({ routed_by: 'auto', route_reason: 'cheapest capable', routing_mode: 'full' }),
    )
  })

  it('the choice goes out with the first message, for that conversation alone', async () => {
    const r = setup('primary')
    act(() => r.store.set(chatDraftAutoAtom, true))
    await send(r)
    // The next conversation starts from the settings again; this one keeps its own.
    await waitFor(() => expect(r.store.get(chatDraftAutoAtom)).toBeNull())
    expect(r.store.get(chatDraftSelectionAtom)).toEqual([])
    expect(r.store.get(chatSessionRoutingAtom)?.routing_mode).toBe('full')
  })

  it('without a choice in the menu no routing_mode is sent: the settings decide', async () => {
    const body = await send(setup('full'))
    expect(body).not.toHaveProperty('routing_mode')
  })
})
