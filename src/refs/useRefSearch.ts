import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { chatSelectedProjectAtom, currentUserAtom } from '@/atoms'
import { getApiBase } from '@/services/env'
import { apiErrorMessage } from '@/services/api'
import { readRefsInvalid, refsApi, type RefSearchItem } from './refsApi'
import { REF_KINDS, type RefKind } from './types'

/** Wait this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 150
const CACHE_MAX = 50
/** A label can change; do not keep an answer for long. */
const CACHE_TTL_MS = 30_000

const cache = new Map<string, { at: number; items: RefSearchItem[] }>()

/** Tests only. */
export const clearRefSearchCache = () => {
  cache.clear()
  cacheUser = undefined
}

/** An answer belongs to a server, an account and the project in view: none of them may read another's. */
const keyOf = (scope: string, kinds: readonly RefKind[], q: string) => `${scope}|${[...kinds].sort().join(',')}|${q.trim().toLowerCase()}`

/** The account the cache was filled for: another one empties it. */
let cacheUser: string | null | undefined

export const refSearchScope = (userId: string | null | undefined, projectId: string | null | undefined): string =>
  `${getApiBase()}|${userId ?? ''}|${projectId ?? ''}`

export type RefSearchState =
  | { status: 'idle'; items: RefSearchItem[] }
  | { status: 'loading'; items: RefSearchItem[] }
  | { status: 'ready'; items: RefSearchItem[] }
  | { status: 'error'; items: RefSearchItem[]; message: string }

const IDLE: RefSearchState = { status: 'idle', items: [] }

/**
 * Results for `query`, debounced (150 ms), cached by (kinds, query), and
 * cancelled: a request the user has typed past is aborted, and its answer can
 * never overwrite a newer one.
 */
export function useRefSearch(args: { query: string; kinds?: readonly RefKind[]; enabled: boolean }): RefSearchState {
  const { query, enabled } = args
  const kinds = args.kinds ?? REF_KINDS
  const kindsKey = [...kinds].sort().join(',')
  const userId = useAtomValue(currentUserAtom)?.id
  const projectId = useAtomValue(chatSelectedProjectAtom)?.id
  const key = keyOf(refSearchScope(userId, projectId), kinds, query)
  const [state, setState] = useState<{ key: string; value: RefSearchState }>({ key: '', value: IDLE })

  // The key already carries the account; this also frees what the previous account left behind.
  useEffect(() => {
    if (cacheUser !== undefined && cacheUser !== userId) cache.clear()
    cacheUser = userId
  }, [userId])

  useEffect(() => {
    if (!enabled) return
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the cache answers synchronously
      setState({ key, value: { status: 'ready', items: hit.items } })
      return
    }
    // Never keep the previous query's list on screen: Enter could pick from it.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a new query
    setState({ key, value: { status: 'loading', items: [] } })
    const controller = new AbortController()
    const timer = setTimeout(() => {
      refsApi
        .search({ q: query.trim(), kinds: kindsKey.split(',') as RefKind[] }, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return
          cache.set(key, { at: Date.now(), items })
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
          setState({ key, value: { status: 'ready', items } })
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
          const message = readRefsInvalid(err)?.message ?? apiErrorMessage(err, 'Search failed')
          setState({ key, value: { status: 'error', items: [], message } })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, key, query, kindsKey])

  // A state computed for another query is stale: show nothing rather than a wrong list.
  return enabled && state.key === key ? state.value : enabled ? { status: 'loading', items: [] } : IDLE
}
