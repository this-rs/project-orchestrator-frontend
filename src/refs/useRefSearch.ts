import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { chatSelectedProjectAtom, currentUserAtom } from '@/atoms'
import { getApiBase } from '@/services/env'
import { readRefsInvalid, refsApi, type RefSearchItem } from './refsApi'
import { actorKinds, entityKinds, kindInfo } from './kinds'
import { useActiveKinds } from './useActiveKinds'
import type { RefKind } from './types'
import type { RefSigil } from './trigger'

/** Wait this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 150
/** A search that has not answered by then is given up: the user gets a message and a retry, not a spinner forever. */
export const SEARCH_TIMEOUT_MS = 8000
export const SEARCH_TIMEOUT_MESSAGE = 'The search is taking too long. Try again.'
export const SEARCH_FAILED_MESSAGE = 'The search is unavailable right now. Try again.'
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
  | { status: 'error'; items: RefSearchItem[]; message: string; retry: () => void }

const NO_ITEMS: RefSearchItem[] = []
type StoredState = Exclude<RefSearchState, { status: 'error' }> | { status: 'error'; items: RefSearchItem[]; message: string }
const IDLE: RefSearchState = { status: 'idle', items: [] }
const EMPTY: RefSearchState = { status: 'ready', items: [] }

/**
 * Results for `query`, debounced (150 ms), cached by (kinds, query), and
 * cancelled: a request the user has typed past is aborted, and its answer can
 * never overwrite a newer one.
 */
export function useRefSearch(args: { query: string; kinds?: readonly RefKind[]; sigil?: RefSigil; enabled: boolean }): RefSearchState {
  const { query } = args
  useActiveKinds() // the default kinds follow what the server lists
  const kinds = args.kinds ?? (args.sigil === '@' ? actorKinds() : entityKinds())
  // A server that lists no kind for this sigil has nothing to search: no request, an honest empty answer.
  const enabled = args.enabled && kinds.length > 0
  const kindsKey = [...kinds].sort().join(',')
  const userId = useAtomValue(currentUserAtom)?.id
  const projectId = useAtomValue(chatSelectedProjectAtom)?.id
  // The sensitive kinds are only suggested inside a project: the `@` search names the one in view.
  const scoped = args.sigil === '@' || kinds.every((k) => kindInfo(k)?.sensitive)
  const key = keyOf(refSearchScope(userId, projectId), kinds, query)
  const [state, setState] = useState<{ key: string; value: StoredState }>({ key: '', value: IDLE })
  const [attempt, setAttempt] = useState(0)
  // The opening request goes out at once; the debounce only protects the keystrokes that follow it.
  const sessionRef = useRef(false)
  const retryNowRef = useRef(false)
  const retry = () => {
    retryNowRef.current = true
    setAttempt((a) => a + 1)
  }

  // The key already carries the account; this also frees what the previous account left behind.
  useEffect(() => {
    if (cacheUser !== undefined && cacheUser !== userId) cache.clear()
    cacheUser = userId
  }, [userId])

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = false
      return
    }
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      sessionRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the cache answers synchronously
      setState({ key, value: { status: 'ready', items: hit.items } })
      return
    }
    const delay = sessionRef.current && !retryNowRef.current ? SEARCH_DEBOUNCE_MS : 0
    sessionRef.current = true
    retryNowRef.current = false
    // The previous list stays on screen (dimmed, nothing active) until the new one lands: the popover does not collapse.
    setState((prev) => ({ key, value: { status: 'loading', items: prev.value.status === 'error' ? NO_ITEMS : prev.value.items } }))
    const controller = new AbortController()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let giveUp: ReturnType<typeof setTimeout> | undefined
    const fail = (message: string) => setState({ key, value: { status: 'error', items: NO_ITEMS, message } })
    timer = setTimeout(() => {
      timer = undefined
      giveUp = setTimeout(() => {
        if (cancelled) return
        controller.abort()
        fail(SEARCH_TIMEOUT_MESSAGE)
      }, SEARCH_TIMEOUT_MS)
      refsApi
        .search({ q: query.trim(), kinds: kindsKey.split(','), ...(scoped ? { projectId } : {}) }, controller.signal)
        .then((items) => {
          if (cancelled) return
          clearTimeout(giveUp)
          cache.set(key, { at: Date.now(), items })
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
          setState({ key, value: { status: 'ready', items } })
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
          clearTimeout(giveUp)
          fail(readRefsInvalid(err)?.message ?? SEARCH_FAILED_MESSAGE)
        })
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(giveUp)
      controller.abort()
    }
  }, [enabled, key, query, kindsKey, attempt, scoped, projectId])

  // A state computed for another query is stale: show nothing rather than a wrong list.
  if (args.enabled && kinds.length === 0) return EMPTY
  if (!enabled) return IDLE
  const value = state.key === key ? state.value : ({ status: 'loading', items: state.value.status === 'error' ? NO_ITEMS : state.value.items } as const)
  return value.status === 'error' ? { ...value, retry } : value
}
