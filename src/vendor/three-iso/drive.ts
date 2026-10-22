// GENERATED from website@68fc05a16f43f7955077d1db0a7a00e456a1d22f:src/three/iso/drive.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Ce qui fait avancer une scène isométrique : le temps (héros : construction puis cycle en boucle) ou le défilement de
 * la page (illustration de bloc : la construction puis le cycle suivent la position du bloc dans la fenêtre).
 */
export type IsoDrive = 'time' | 'scroll'

/** Avancement d'un bloc dans la fenêtre : 0 quand son haut entre par le bas, 1 quand son bas sort par le haut. */
export function scrollProgress(el: Element): number {
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight || 1
  return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
}
