// GENERATED from website@8ff26ee08f7be0342973cc35bcffb837b7fc5e0f:src/three/iso/fit.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Cadrage des machines de héros : la boîte de tout ce que la machine dessine pendant un cycle (en pixels du viewBox
 * 1200 × 700), pour que le SVG prérendu et le rendu WebGL la mettent ENTIÈRE dans la zone visible du héros (sous la
 * barre et le fondu du haut, au-dessus du fondu du bas, entre les fondus latéraux), centrée, à la plus grande échelle
 * qui tienne : rien ne dépasse, quel que soit le rapport de l'écran.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests et au prérendu.
 */
import { toView } from './compose.ts'
import { withHiddenFaces } from './iso.ts'
import type { MachineDef } from './machine.ts'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const cache = new WeakMap<MachineDef, Box>()

/** Boîte englobante de la machine sur tout son cycle (20 instants), avec une marge `pad` (pixels du viewBox). */
export function contentBox(m: MachineDef, pad = 14): Box {
  const hit = cache.get(m)
  if (hit) return hit
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < 20; i++) {
    for (const f of withHiddenFaces(() => m.build((m.t0 + i / 20) % 1, 2))) {
      if (f.alpha < 0.05) continue
      for (const p of f.pts) {
        const v = toView(m, p)
        if (v[0] < x0) x0 = v[0]
        if (v[0] > x1) x1 = v[0]
        if (v[1] < y0) y0 = v[1]
        if (v[1] > y1) y1 = v[1]
      }
    }
  }
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  let b: Box
  if (m.anchor) {
    // Boîte symétrique autour du centre de l'espace libre : centrée dans la zone visible, elle y met ce point au milieu,
    // là où se centre le texte du héros (hero.css), sans mesure à l'exécution (le SVG prérendu tombe juste aussi).
    const [ax, ay] = m.anchor
    const mx = Math.max(ax - x0, x1 - ax)
    const my = Math.max(ay - y0, y1 - ay)
    b = { x: Math.floor(ax - mx), y: Math.floor(ay - my), w: Math.ceil(2 * mx), h: Math.ceil(2 * my) }
  } else b = { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) }
  cache.set(m, b)
  return b
}

/** Fenêtre du viewBox montrée dans un cadre de `cw` × `ch` pixels : la boîte entière, centrée (« meet »). */
export function fitWindow(b: Box, cw: number, ch: number): Box {
  const k = Math.min(cw / b.w, ch / b.h)
  const w = cw / k
  const h = ch / k
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }
}
