/**
 * `chatProviderTargetAtom`: the few provider facts the permission controls and
 * the tool renderers branch on.
 *
 * Run with: npx vitest run src/atoms/__tests__/toolPolicy.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createStore } from 'jotai'
import {
  chatProviderTargetAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionIdAtom,
  chatSessionProviderAtom,
  chatSelectedProviderAtom,
  providersLoadStateAtom,
} from '@/atoms'

describe('chatProviderTargetAtom', () => {
  it('a session without a provider is Claude Code: legacy wire, trust allowed, rules shown', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    expect(store.get(chatProviderTargetAtom)).toEqual({
      isClaudeCode: true,
      providerKind: 'claude_code',
      neutralWire: false,
      sandboxed: false,
      ruleScopes: true,
    })
    // Still legacy once the backend exposes providers.
    store.set(providersLoadStateAtom, 'ready')
    expect(store.get(chatProviderTargetAtom).neutralWire).toBe(false)
  })

  it('a third-party session speaks neutral only when the backend exposes providers', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'codex-1', kind: 'codex' })
    expect(store.get(chatProviderTargetAtom)).toMatchObject({ isClaudeCode: false, providerKind: 'codex', neutralWire: false })
    store.set(providersLoadStateAtom, 'ready')
    expect(store.get(chatProviderTargetAtom).neutralWire).toBe(true)
  })

  it('reads sandbox and rule scopes from the session capabilities', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 's1')
    store.set(chatSessionProviderAtom, { id: 'local-llama' })
    // Nothing declared: the minimal profile — no sandbox, no rule scopes.
    expect(store.get(chatProviderTargetAtom)).toMatchObject({ providerKind: 'unknown', sandboxed: false, ruleScopes: false })
    store.set(chatSessionCapabilitiesSnapshotAtom, { sandbox: 'workspace', permission_scopes: ['session'] })
    expect(store.get(chatProviderTargetAtom)).toMatchObject({ sandboxed: true, ruleScopes: true })
  })

  it('a backend without provider routes has one provider, whatever was picked last', () => {
    const store = createStore()
    store.set(chatSelectedProviderAtom, 'local-llama')
    expect(store.get(chatProviderTargetAtom).isClaudeCode).toBe(false)
    store.set(providersLoadStateAtom, 'unsupported')
    expect(store.get(chatProviderTargetAtom)).toMatchObject({ isClaudeCode: true, providerKind: 'claude_code', neutralWire: false })
  })
})
