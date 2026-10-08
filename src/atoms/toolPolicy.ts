import { atom } from 'jotai'
import { hasSandbox, isClaudeCodeProvider, isRemoteClaudeCode, type ProviderKind } from '@/types/provider'
import {
  chatEffectiveProviderAtom,
  chatTargetProviderIdAtom,
  chatSessionCapabilitiesAtom,
  chatSessionProviderAtom,
  providersLoadStateAtom,
} from './providers'

/** What the permission controls and the tool renderers need to know about the provider in front of them. */
export interface ChatProviderTarget {
  /** Claude Code, a session created before providers existed, or a backend without providers. */
  isClaudeCode: boolean
  /** Kind used by the tool renderer registry. Never empty: an unidentified third party is `unknown`. */
  providerKind: ProviderKind
  /**
   * Send permission modes in their neutral form. Only for a non-Claude provider
   * on a backend that exposes providers: anything else gets the legacy string
   * it has always understood.
   */
  neutralWire: boolean
  /** Tools run in a sandbox. Information for the user, not a gate on any mode. */
  sandboxed: boolean
  /**
   * `trust` cannot be picked: a Claude Code on another machine whose record does not allow it.
   * Every other provider behaves like Claude Code (decision of 2026-10-07, replaces A35).
   */
  trustHeldBack: boolean
  /** The provider applies allow/deny rules and can remember a permission answer. */
  ruleScopes: boolean
}

/**
 * The provider the composer is talking to (the session's, or the one a new
 * conversation would get), reduced to the few facts the interface branches on.
 */
export const chatProviderTargetAtom = atom<ChatProviderTarget>((get) => {
  const loadState = get(providersLoadStateAtom)
  const kind = get(chatSessionProviderAtom)?.kind ?? get(chatEffectiveProviderAtom)?.kind ?? null
  // A backend without provider routes has one provider, whatever a stale
  // "last picked provider" in local storage says.
  const isClaudeCode = loadState === 'unsupported' || isClaudeCodeProvider(get(chatTargetProviderIdAtom), kind)
  const caps = get(chatSessionCapabilitiesAtom)
  const instance = get(chatEffectiveProviderAtom)
  return {
    isClaudeCode,
    providerKind: isClaudeCode ? 'claude_code' : (kind ?? 'unknown'),
    neutralWire: !isClaudeCode && loadState === 'ready',
    sandboxed: hasSandbox(caps),
    trustHeldBack: isRemoteClaudeCode(kind) && instance?.allow_trust !== true,
    ruleScopes: isClaudeCode || caps.permission_scopes.length > 0,
  }
})
