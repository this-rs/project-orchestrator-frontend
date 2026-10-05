/**
 * Provider atoms: what the current conversation runs on and can do.
 *
 * Run with: npx vitest run src/atoms/__tests__/providers.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStore } from 'jotai'

const list = vi.fn()
vi.mock('@/services/providers', () => ({
  providersApi: { list: (...a: unknown[]) => list(...a) },
}))

import { ApiError } from '@/services/api'
import {
  chatEffectiveProviderIdAtom,
  chatPermissionConfigAtom,
  chatPermissionInteractiveAtom,
  chatSelectedProviderAtom,
  chatSessionCapabilitiesAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  fetchProviders,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { CLAUDE_CODE_CAPABILITIES, MINIMAL_CAPABILITIES, type ProvidersResponse } from '@/types/provider'
import { NATIVE_SYSTEM_INIT } from '@/utils/__fixtures__/systemInitFrames'

const PROVIDERS: ProvidersResponse = {
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', builtin: true, health: { status: 'healthy' }, models: [] },
    {
      id: 'local-llama',
      kind: 'openai_compatible',
      label: 'Local llama-server',
      health: { status: 'healthy' },
      capabilities: { tools: true, resume: true, cost: 'free' },
      default_model: 'qwen',
      models: [{ id: 'qwen' }, { id: 'llava', capabilities: { images: true } }],
    },
  ],
  default: { provider: 'claude-code', routed_by: 'claude_code_fallback' },
}

beforeEach(() => {
  list.mockReset()
  localStorage.clear()
})

describe('session capabilities', () => {
  it('is the full Claude profile for a session that names no provider', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'old-session')
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('claude-code')
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(CLAUDE_CODE_CAPABILITIES)
  })

  it('stays Claude for an existing legacy session even if another provider is picked for new ones', () => {
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    store.set(chatSelectedProviderAtom, 'local-llama')
    store.set(chatSessionIdAtom, 'old-session')
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('claude-code')
    expect(store.get(chatSessionCapabilitiesAtom).images).toBe(true)
  })

  it('exposes the restricted capabilities a system_init carries', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'local-llama', kind: 'openai_compatible' })
    store.set(chatSessionCapabilitiesSnapshotAtom, NATIVE_SYSTEM_INIT.capabilities)
    const caps = store.get(chatSessionCapabilitiesAtom)
    expect(caps.interactive_permissions).toBe(false)
    expect(caps.images).toBe(false)
    expect(caps.subagents).toBe('none')
    expect(caps.cost).toBe('free')
    expect(caps.context_window).toEqual({ value: 32768, source: 'probe' })
    expect(caps.tools).toBe(true)
  })

  it('assumes the minimal profile for a third-party session whose capabilities are unknown', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'mystery' })
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(MINIMAL_CAPABILITIES)
  })

  it('knows the capabilities BEFORE any session, from the provider list and the picked model', () => {
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    store.set(chatSelectedProviderAtom, 'local-llama')
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('local-llama')
    // default model of the instance
    expect(store.get(chatSessionCapabilitiesAtom).images).toBe(false)
    expect(store.get(chatSessionCapabilitiesAtom).cost).toBe('free')
    // capabilities are per model
    store.set(chatSessionModelAtom, 'llava')
    expect(store.get(chatSessionCapabilitiesAtom).images).toBe(true)
  })

  it('uses the server default when nothing is picked, and ignores a remembered pick that no longer exists', () => {
    const store = createStore()
    store.set(providersAtom, { ...PROVIDERS, default: { provider: 'local-llama', routed_by: 'configured_default' } })
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('local-llama')
    store.set(chatSelectedProviderAtom, 'deleted-instance')
    expect(store.get(chatEffectiveProviderIdAtom)).toBe('local-llama')
  })
})

describe('chatPermissionInteractiveAtom', () => {
  const config = (mode: string) => ({ mode: mode as never, allowed_tools: [], disallowed_tools: [] })

  it('is true for Claude Code in an asking mode and false in bypassPermissions (unchanged behaviour)', () => {
    const store = createStore()
    expect(store.get(chatPermissionInteractiveAtom)).toBe(false) // config not loaded
    store.set(chatPermissionConfigAtom, config('default'))
    expect(store.get(chatPermissionInteractiveAtom)).toBe(true)
    store.set(chatPermissionConfigAtom, config('bypassPermissions'))
    expect(store.get(chatPermissionInteractiveAtom)).toBe(false)
    store.set(chatPermissionConfigAtom, config('trust'))
    expect(store.get(chatPermissionInteractiveAtom)).toBe(false)
  })

  it('is false when the provider cannot ask, whatever the mode', () => {
    const store = createStore()
    store.set(chatPermissionConfigAtom, config('default'))
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'local-llama' })
    store.set(chatSessionCapabilitiesSnapshotAtom, { interactive_permissions: false })
    expect(store.get(chatPermissionInteractiveAtom)).toBe(false)
  })
})

describe('fetchProviders', () => {
  const run = async () => {
    const store = createStore()
    await fetchProviders(
      (v) => store.set(providersAtom, v),
      (s) => store.set(providersLoadStateAtom, s),
    )
    return store
  }

  it('stores the list', async () => {
    list.mockResolvedValue(PROVIDERS)
    const store = await run()
    expect(store.get(providersLoadStateAtom)).toBe('ready')
    expect(store.get(providersAtom)?.providers).toHaveLength(2)
  })

  it('reads a backend without provider routes (404) as "Claude Code only", not as an error', async () => {
    list.mockRejectedValue(new ApiError(404, 'Not Found'))
    const store = await run()
    expect(store.get(providersLoadStateAtom)).toBe('unsupported')
    expect(store.get(providersAtom)).toBeNull()
    expect(store.get(chatSessionCapabilitiesAtom)).toEqual(CLAUDE_CODE_CAPABILITIES)
  })

  it('reports another failure as an error and never throws', async () => {
    list.mockRejectedValue(new ApiError(500, 'boom'))
    const store = await run()
    expect(store.get(providersLoadStateAtom)).toBe('error')
  })

  it('does not take an unrelated 200 body for a provider list', async () => {
    list.mockResolvedValue({})
    const store = await run()
    expect(store.get(providersLoadStateAtom)).toBe('unsupported')
    expect(store.get(providersAtom)).toBeNull()
  })
})
