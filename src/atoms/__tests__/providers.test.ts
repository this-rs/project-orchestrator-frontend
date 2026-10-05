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
  chatDefaultModelAtom,
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
  default: { provider: 'claude-code', routed_by: 'claude_code' },
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
    expect(caps.context_window).toEqual({ value: 32768, source: 'probed' })
    expect(caps.permission_scopes).toEqual([])
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
    store.set(providersAtom, { ...PROVIDERS, default: { provider: 'local-llama', routed_by: 'default' } })
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

describe('fetchProviders — one answer per project', () => {
  const setters = (store: ReturnType<typeof createStore>) =>
    [
      (v: ProvidersResponse | null) => store.set(providersAtom, v),
      (s: Parameters<Parameters<typeof fetchProviders>[1]>[0]) => store.set(providersLoadStateAtom, s),
    ] as const

  it('shares one request between overlapping calls for the same project', async () => {
    list.mockResolvedValue(PROVIDERS)
    const store = createStore()
    await Promise.all([
      fetchProviders(...setters(store), { project_slug: 'alpha' }),
      fetchProviders(...setters(store), { project_slug: 'alpha' }),
    ])
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.get(providersLoadStateAtom)).toBe('ready')
  })

  it('asks again for another project, and the older answer does not overwrite the newer', async () => {
    let resolveAlpha: (v: ProvidersResponse) => void = () => {}
    list.mockReturnValueOnce(new Promise<ProvidersResponse>((r) => (resolveAlpha = r)))
    const forBeta: ProvidersResponse = { ...PROVIDERS, default: { provider: 'local-llama', routed_by: 'project_rule' } }
    list.mockResolvedValueOnce(forBeta)
    const store = createStore()
    const alpha = fetchProviders(...setters(store), { project_slug: 'alpha' })
    await fetchProviders(...setters(store), { project_slug: 'beta' })
    expect(list).toHaveBeenCalledTimes(2)
    resolveAlpha(PROVIDERS)
    await alpha
    expect(store.get(providersAtom)?.default?.provider).toBe('local-llama')
    expect(store.get(providersLoadStateAtom)).toBe('ready')
  })
})

describe('default model of the conversation', () => {
  const config = (default_model?: string) => ({ mode: 'default' as const, allowed_tools: [], disallowed_tools: [], default_model })

  it('is the configured chat model on a backend without providers, and null when none is advertised', () => {
    const store = createStore()
    store.set(providersLoadStateAtom, 'unsupported')
    // A pick remembered from another server changes nothing.
    store.set(chatSelectedProviderAtom, 'local-llama')
    expect(store.get(chatDefaultModelAtom)).toBeNull()
    store.set(chatPermissionConfigAtom, config('claude-opus-5-5'))
    expect(store.get(chatDefaultModelAtom)).toBe('claude-opus-5-5')
  })

  it('is the model of the resolved default when it is about the provider in use', () => {
    const store = createStore()
    store.set(providersAtom, { ...PROVIDERS, default: { provider: 'local-llama', model: 'llava', routed_by: 'project_rule' } })
    expect(store.get(chatDefaultModelAtom)).toBe('llava')
  })

  it('is the default of the picked instance otherwise, never the configured Claude model', () => {
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    store.set(chatPermissionConfigAtom, config('claude-opus-5-5'))
    store.set(chatSelectedProviderAtom, 'local-llama')
    expect(store.get(chatDefaultModelAtom)).toBe('qwen')
    store.set(providersAtom, {
      ...PROVIDERS,
      providers: PROVIDERS.providers.map((p) => ({ ...p, default_model: null })),
    })
    expect(store.get(chatDefaultModelAtom)).toBeNull()
  })

  it('falls back to the configured chat model for Claude Code', () => {
    const store = createStore()
    store.set(providersAtom, PROVIDERS)
    store.set(chatPermissionConfigAtom, config('claude-opus-5-5'))
    expect(store.get(chatDefaultModelAtom)).toBe('claude-opus-5-5')
  })
})
