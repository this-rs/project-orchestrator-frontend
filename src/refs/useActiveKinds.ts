import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { useSyncExternalStore } from 'react'
import { currentUserAtom, isAuthenticatedAtom } from '@/atoms'
import { refsEnabledAtom } from '@/atoms/chat'
import { getApiBase } from '@/services/env'
import { HISTORICAL_KINDS, cachedRefKinds, ensureRefKinds, getActiveKinds, setActiveKinds, subscribeKinds, type KindInfo } from './kinds'
import { refsCapabilityScope } from './refsCapability'

/** The kinds this server resolves; re-renders when they arrive. Historical five until then. */
export const useActiveKinds = (): readonly KindInfo[] => useSyncExternalStore(subscribeKinds, getActiveKinds, getActiveKinds)

/**
 * Mounted once (ReferenceSourceHost): once the server speaks references, ask
 * which kinds it resolves. Until it answers, and for a server that has no
 * such route, the five historical kinds stay in force.
 */
export function useRefKindsSync(): void {
  const enabled = useAtomValue(refsEnabledAtom)
  const authenticated = useAtomValue(isAuthenticatedAtom)
  const userId = useAtomValue(currentUserAtom)?.id
  const scope = refsCapabilityScope(getApiBase(), userId)
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
