import { useCallback, useEffect } from 'react'
import { useAtomValue, useStore } from 'jotai'
import {
  chatSelectedProjectAtom,
  fetchProviders,
  providersAtom,
  providersLoadStateAtom,
  type ProvidersLoadState,
} from '@/atoms'
import type { ProviderInstance, ResolvedDefault } from '@/types/provider'

const NO_PROVIDERS: ProviderInstance[] = []

export interface UseProvidersResult {
  providers: ProviderInstance[]
  /** What a new conversation gets when nothing is picked. */
  default: ResolvedDefault | null
  state: ProvidersLoadState
  refresh: () => Promise<void>
}

/**
 * Load the provider instances for the chat, and again whenever the selected
 * project changes: `allowed_for_project` is an answer about ONE project.
 *
 * `state === 'unsupported'` (backend without provider routes) means one
 * provider, Claude Code: callers render no provider selector at all.
 */
export function useProviders(): UseProvidersResult {
  const store = useStore()
  const list = useAtomValue(providersAtom)
  const state = useAtomValue(providersLoadStateAtom)
  const projectSlug = useAtomValue(chatSelectedProjectAtom)?.slug

  const refresh = useCallback(
    () =>
      fetchProviders(
        (value) => store.set(providersAtom, value),
        (next) => {
          // A refresh keeps `ready`: the list on screen stays usable while the
          // new one loads, and going back to `loading` would flip everything
          // derived from the state (wire format of modes, selector) for a blink.
          if (next === 'loading' && store.get(providersLoadStateAtom) === 'ready') return
          store.set(providersLoadStateAtom, next)
        },
        projectSlug ? { project_slug: projectSlug } : {},
      ),
    [store, projectSlug],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { providers: list?.providers ?? NO_PROVIDERS, default: list?.default ?? null, state, refresh }
}
