import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function mql(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null
}

function subscribe(cb: () => void) {
  const m = mql()
  m?.addEventListener?.('change', cb)
  return () => m?.removeEventListener?.('change', cb)
}

/** `prefers-reduced-motion: reduce` — false when matchMedia is unavailable. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql()?.matches ?? false,
    () => false
  )
}
