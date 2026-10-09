import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { useSyncExternalStore } from 'react'
import { isAuthenticatedAtom } from '@/atoms'
import { refsEnabledAtom } from '@/atoms/chat'
import { HISTORICAL_KINDS, cachedRefKinds, ensureRefKinds, getActiveKinds, setActiveKinds, subscribeKinds, type KindInfo } from './kinds'

/** The kinds this server resolves; re-renders when they arrive. Historical five until then. */
export const useActiveKinds = (): readonly KindInfo[] => useSyncExternalStore(subscribeKinds, getActiveKinds, getActiveKinds)

/**
 * Mounted once, by the chat hook (which owns the server/account scope): once the server speaks references, ask
 * which kinds it resolves. Until it answers, and for a server that has no
 * such route, the five historical kinds stay in force.
 */
export function useRefKindsSync(scope: string): void {
  const enabled = useAtomValue(refsEnabledAtom)
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const synced = useRef(false)
  useEffect(() => {
    if (!enabled || !authenticated) {
      // Signed out, or a server that no longer speaks references: forget what a previous sync taught (and only that).
      if (synced.current) setActiveKinds(HISTORICAL_KINDS)
      synced.current = false
      return
    }
    synced.current = true
    // Another account or server: what was learned about the previous one does not apply.
    setActiveKinds(cachedRefKinds(scope) ?? HISTORICAL_KINDS)
    let current = true
    void ensureRefKinds(scope).then((answer) => {
      if (current && answer) setActiveKinds(answer)
    })
    return () => {
      current = false
    }
  }, [enabled, authenticated, scope])
}
