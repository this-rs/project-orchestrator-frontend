// GENERATED from website@61b8193b80146bbceefa1ac92cd9536f2740a6ba:src/three/iso/focus.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Le poste mis en avant par le lecteur dans une scène (survol, toucher), partagé entre la scène (qui le soulève et
 * l'allume) et la page (qui explique la brique dans l'espace central). Un état par scène (`id` de la machine).
 */
import { useSyncExternalStore } from 'react'

const state = new Map<string, number | null>()
const subs = new Set<() => void>()

const timers = new Map<string, number>()

/** Met un poste en avant (annule une relâche en attente). */
export function setIsoFocus(id: string, i: number | null): void {
  const t = timers.get(id)
  if (t !== undefined) {
    clearTimeout(t)
    timers.delete(id)
  }
  if (state.get(id) === i) return
  state.set(id, i)
  for (const f of subs) f()
}

/** Relâche le poste mis en avant après `ms` — sauf si un autre `setIsoFocus` arrive entre-temps (le pointeur passe
 * du poste à l'explication centrale sans la refermer). */
export function releaseIsoFocus(id: string, ms = 700): void {
  const t = timers.get(id)
  if (t !== undefined) clearTimeout(t)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      setIsoFocus(id, null)
    }, ms) as unknown as number,
  )
}

export function getIsoFocus(id: string): number | null {
  return state.get(id) ?? null
}

/** S'abonner aux changements de poste mis en avant (toutes scènes). */
export const onIsoFocus = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

/** Le poste mis en avant dans la scène `id`, ou null. */
export function useIsoFocus(id: string): number | null {
  return useSyncExternalStore(
    onIsoFocus,
    () => getIsoFocus(id),
    () => null,
  )
}
