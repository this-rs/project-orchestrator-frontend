import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { ApiError } from '@/services/api'
import { providersApi } from '@/services/providers'
import {
  CLAUDE_CODE_PROVIDER_ID,
  capabilitiesFallback,
  capabilitiesFor,
  normalizeCapabilities,
  toToolPolicyMode,
  type ProviderCapabilities,
  type ProviderId,
  type ProviderInstance,
  type ProviderRef,
  type ProvidersResponse,
  type ToolPolicy,
} from '@/types/provider'
import { chatPermissionConfigAtom, chatSessionIdAtom, chatSessionModelAtom } from './chat'

/**
 * - `idle` — never asked.
 * - `loading` — first fetch in flight.
 * - `ready` — the list is in `providersAtom`.
 * - `unsupported` — the backend has no provider routes (404): one provider, Claude Code.
 * - `error` — the fetch failed for another reason; the previous list (if any) stays.
 */
export type ProvidersLoadState = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

/** Provider instances of this server. `null` until loaded, and forever on a pre-provider backend. */
export const providersAtom = atom<ProvidersResponse | null>(null)
export const providersLoadStateAtom = atom<ProvidersLoadState>('idle')

let fetchInFlight = false

/**
 * Load the instances. Safe to call repeatedly (overlapping calls are deduped);
 * never throws. A 404/405 means the backend predates providers.
 */
export function fetchProviders(
  set: (value: ProvidersResponse | null) => void,
  setState: (state: ProvidersLoadState) => void,
  params: { project_slug?: string } = {},
): Promise<void> {
  if (fetchInFlight) return Promise.resolve()
  fetchInFlight = true
  setState('loading')
  return providersApi
    .list(params)
    .then((res) => {
      if (res && Array.isArray(res.providers)) {
        set(res)
        setState('ready')
      } else {
        // A 200 with another shape is not a provider list.
        setState('unsupported')
      }
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        set(null)
        setState('unsupported')
      } else {
        setState('error')
      }
    })
    .finally(() => {
      fetchInFlight = false
    })
}

/**
 * Provider of the CURRENT session, as its last `system_init` (or its session
 * record) said. `null` = not said: a session created before providers existed,
 * i.e. Claude Code.
 */
export const chatSessionProviderAtom = atom<ProviderRef | null>(null)

/**
 * Capabilities carried by the LAST `system_init` of the current session
 * (a resume may change them after a provider update). `null` = none carried.
 */
export const chatSessionCapabilitiesSnapshotAtom = atom<Partial<ProviderCapabilities> | null>(null)

/** Neutral tool policy of the current session, from `system_init.tool_policy`. */
export const chatSessionToolPolicyAtom = atom<ToolPolicy | null>(null)

/**
 * Provider picked for the NEXT new conversation. `null` = let the server
 * resolve its default. Remembered across reloads: it is the user's last choice.
 */
export const chatSelectedProviderAtom = atomWithStorage<ProviderId | null>('chat-selected-provider', null, undefined, {
  getOnInit: true,
})

function findInstance(list: ProvidersResponse | null, id: ProviderId): ProviderInstance | null {
  return list?.providers.find((p) => p.id === id) ?? null
}

/**
 * Id of the provider the composer is talking to: the session's, or — before
 * any session exists — the picked one, then the server default, then Claude Code.
 */
export const chatEffectiveProviderIdAtom = atom<ProviderId>((get) => {
  const ofSession = get(chatSessionProviderAtom)
  if (ofSession) return ofSession.id
  if (get(chatSessionIdAtom)) return CLAUDE_CODE_PROVIDER_ID
  const list = get(providersAtom)
  const picked = get(chatSelectedProviderAtom)
  if (picked && (!list || findInstance(list, picked))) return picked
  return list?.default?.provider ?? CLAUDE_CODE_PROVIDER_ID
})

/** The instance behind `chatEffectiveProviderIdAtom`, when the list knows it. */
export const chatEffectiveProviderAtom = atom<ProviderInstance | null>((get) =>
  findInstance(get(providersAtom), get(chatEffectiveProviderIdAtom)),
)

/**
 * What the current conversation can do.
 *
 * Order: the last `system_init` snapshot → the (instance, model) entry of the
 * provider list → the fallback profile, which is the FULL Claude profile for a
 * Claude/legacy session and the minimal one for an unknown third-party instance.
 */
export const chatSessionCapabilitiesAtom = atom<ProviderCapabilities>((get) => {
  const id = get(chatEffectiveProviderIdAtom)
  const ref = get(chatSessionProviderAtom)
  const instance = get(chatEffectiveProviderAtom)
  const base = instance
    ? capabilitiesFor(instance, get(chatSessionModelAtom) ?? instance.default_model)
    : normalizeCapabilities(null, capabilitiesFallback(id, ref?.kind))
  const snapshot = get(chatSessionCapabilitiesSnapshotAtom)
  return snapshot ? normalizeCapabilities(snapshot, base) : base
})

/**
 * True when a tool call can stop and wait for the human: the provider can ask
 * AND the mode is not `trust`.
 */
export const chatPermissionInteractiveAtom = atom((get) => {
  const config = get(chatPermissionConfigAtom)
  if (config === null) return false
  if (toToolPolicyMode(config.mode) === 'trust') return false
  return get(chatSessionCapabilitiesAtom).interactive_permissions
})
