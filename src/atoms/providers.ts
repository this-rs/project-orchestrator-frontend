import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { ApiError } from '@/services/api'
import { providersApi } from '@/services/providers'
import {
  CLAUDE_CODE_PROVIDER_ID,
  capabilitiesFallback,
  capabilitiesFor,
  isClaudeCodeProvider,
  normalizeCapabilities,
  toToolPolicyMode,
  type ProviderCapabilities,
  type ProviderErrorInfo,
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

/** The request in flight, and which project it asked about. */
let inFlight: { key: string; generation: number; promise: Promise<void> } | null = null
let fetchGeneration = 0

/**
 * Load the instances. Safe to call repeatedly (overlapping calls for the same
 * project share one request); never throws. A 404/405 means the backend
 * predates providers.
 *
 * A call for ANOTHER project while one is in flight starts its own request and
 * the older answer is dropped: `allowed_for_project` is about one project, and
 * the list on screen must be the one of the project now selected.
 */
export function fetchProviders(
  set: (value: ProvidersResponse | null) => void,
  setState: (state: ProvidersLoadState) => void,
  params: { project_slug?: string } = {},
): Promise<void> {
  const key = params.project_slug ?? ''
  if (inFlight && inFlight.key === key) return inFlight.promise
  const generation = ++fetchGeneration
  const current = () => generation === fetchGeneration
  setState('loading')
  const promise = providersApi
    .list(params)
    .then((res) => {
      if (!current()) return
      if (res && Array.isArray(res.providers)) {
        set(res)
        setState('ready')
      } else {
        // A 200 with another shape is not a provider list.
        setState('unsupported')
      }
    })
    .catch((err: unknown) => {
      if (!current()) return
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        set(null)
        setState('unsupported')
      } else {
        setState('error')
      }
    })
    .finally(() => {
      if (inFlight?.generation === generation) inFlight = null
    })
  inFlight = { key, generation, promise }
  return promise
}

/**
 * Why the last attempt to OPEN a conversation failed (`POST /chat/sessions`).
 * `info` is the typed provider error when the server sent one; `text` and
 * `attachments` are the message that did not leave, so nothing typed is lost.
 */
export interface ChatSessionOpenError {
  info: ProviderErrorInfo | null
  /** Human sentence, for when `info` is absent or carries no message. */
  message: string
  /** The message that was not sent. */
  text: string
  /** Document ids that were attached to it. */
  attachments: string[]
}

export const chatSessionOpenErrorAtom = atom<ChatSessionOpenError | null>(null)

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

/**
 * Engine of the current session and what it cannot do (`system_init.engine`,
 * `degraded_features`; names assumed until the backend contract carries them).
 * Empty = nothing said: no banner.
 */
export interface ChatSessionEngine {
  engine: string | null
  degraded: string[]
}
export const chatSessionEngineAtom = atom<ChatSessionEngine>({ engine: null, degraded: [] })

/** Neutral tool policy of the current session, from `system_init.tool_policy`. */
export const chatSessionToolPolicyAtom = atom<ToolPolicy | null>(null)

/**
 * Provider picked for the NEXT new conversation. `null` = let the server
 * resolve its default. Remembered across reloads: it is the user's last choice.
 */
const SELECTED_PROVIDER_KEY = 'chat-selected-provider'

/** localStorage that never throws (private window, blocked site data): the pick is then just not remembered. */
const selectedProviderStorage = createJSONStorage<ProviderId | null>(() => ({
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* not remembered */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing to forget */
    }
  },
}))

export const chatSelectedProviderAtom = atomWithStorage<ProviderId | null>(SELECTED_PROVIDER_KEY, null, selectedProviderStorage, {
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
  const merged = snapshot ? normalizeCapabilities(snapshot, base) : base
  // `images: true` is the fallback of a LEGACY Claude Code session (it takes
  // attachments today). On the agent engine Claude Code takes none in v1: when
  // that engine is known and nobody declared `images`, the fallback must not
  // offer attachments that would be dropped.
  const model = get(chatSessionModelAtom) ?? instance?.default_model
  const declared =
    snapshot?.images !== undefined ||
    instance?.capabilities?.images !== undefined ||
    instance?.models.find((m) => m.id === model)?.capabilities?.images !== undefined
  if (!declared && merged.images && get(chatSessionEngineAtom).engine === 'agent') return { ...merged, images: false }
  return merged
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

/**
 * The model a conversation runs on when none was picked, as the SERVER says:
 * the resolved default when it is about this provider, then the instance's own
 * default, then (Claude Code only) the configured chat model. `null` = nobody
 * said — the interface then shows "Default model", never an invented id.
 */
export const chatDefaultModelAtom = atom<string | null>((get) => {
  const id = get(chatEffectiveProviderIdAtom)
  const resolved = get(providersAtom)?.default
  if (resolved && resolved.provider === id) {
    const model = resolved.model ?? resolved.alias
    if (model) return model
  }
  const instance = get(chatEffectiveProviderAtom)
  if (instance?.default_model) return instance.default_model
  // A backend without provider routes has one provider, whatever a stale pick says.
  const claude =
    get(providersLoadStateAtom) === 'unsupported' ||
    isClaudeCodeProvider(id, instance?.kind ?? get(chatSessionProviderAtom)?.kind)
  if (claude) {
    return get(chatPermissionConfigAtom)?.default_model || null
  }
  return null
})
