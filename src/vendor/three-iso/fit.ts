// GENERATED from website@185eab267e4d5376df1cabbb8309fe7e53a4206b:src/three/iso/fit.ts by scripts/sync-iso-lib.mjs — do not edit.
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
const quick = new WeakMap<MachineDef, Box>()

/** Boîte englobante de la machine sur tout son cycle (20 instants, ou `samples`), avec une marge `pad` (pixels du
 * viewBox). Une estimation rapide (peu d'instants) sert à comparer des variantes, jamais au dessin. */
export function contentBox(m: MachineDef, pad = 14, samples = 20): Box {
  const store = samples < 20 ? quick : cache
  const hit = store.get(m)
  if (hit) return hit
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < samples; i++) {
    for (const f of withHiddenFaces(() => m.build((m.t0 + i / samples) % 1, samples < 20 ? 1 : 2))) {
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
  store.set(m, b)
  return b
}

/** Fenêtre du viewBox montrée dans un cadre de `cw` × `ch` pixels : la boîte entière, centrée (« meet »). */
export function fitWindow(b: Box, cw: number, ch: number): Box {
  const k = Math.min(cw / b.w, ch / b.h)
  const w = cw / k
  const h = ch / k
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }
}

/** Un rectangle en pixels CSS, relatif au cadre (le canvas). */
export interface CssRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Boîtes des postes d'une machine en pixels CSS du cadre `cw` × `ch` (l'objet monte au-dessus du socle). */
export function stationBoxes(m: MachineDef, cw: number, ch: number): CssRect[] {
  const hs = m.hotspots
  if (!hs) return []
  const win = fitWindow(contentBox(m, 14, 3), cw, ch)
  const k = cw / win.w
  const C = Math.cos(Math.PI / 6)
  const r = hs.radius * m.U * C * k
  return hs.at.map((p) => {
    const x = (m.origin[0] + (p[0] - p[1]) * C * m.U - win.x) * k
    const y = (m.origin[1] + ((p[0] + p[1]) * 0.5 - p[2]) * m.U - win.y) * k
    return { x0: x - r, x1: x + r, y0: y - r * 1.9, y1: y + r * 0.75 }
  })
}

/** Aire de recouvrement (marge `pad` comprise) d'une boîte de poste et du texte. */
const overlap = (a: CssRect, b: CssRect, pad: number) =>
  Math.max(0, Math.min(a.x1, b.x1 + pad) - Math.max(a.x0, b.x0 - pad)) * Math.max(0, Math.min(a.y1, b.y1 + pad) - Math.max(a.y0, b.y0 - pad))

/**
 * La première variante (`variant(g)` pour g croissant) dont aucun poste ne recouvre le texte `text` (pixels CSS du
 * cadre). Sert sur ordinateur (étirement vertical de la disposition) et sur téléphone (écart des deux blocs). Si aucune
 * ne suffit, la plus écartée.
 */
export function fitAround(variant: (g: number) => MachineDef, steps: readonly number[], cw: number, ch: number, text: CssRect, pad = 10): MachineDef {
  return fitAroundScored(variant, steps, cw, ch, text, pad).machine
}

/** Comme `fitAround`, avec l'aire de texte que la meilleure variante recouvre encore (0 = dégagé). */
export function fitAroundScored(variant: (g: number) => MachineDef, steps: readonly number[], cw: number, ch: number, text: CssRect, pad = 10): { machine: MachineDef; area: number } {
  // La variante (dans l'ordre : de la moins à la plus déformée) qui recouvre le moins le texte ; on s'arrête à la
  // première qui le dégage entièrement. Un gain de moins de 5 % ne justifie pas une déformation de plus.
  let best = variant(steps[0]!)
  let bestArea = Infinity
  for (const g of steps) {
    const m = variant(g)
    const area = stationBoxes(m, cw, ch).reduce((sum, b) => sum + overlap(b, text, pad), 0)
    if (area < bestArea * 0.95) {
      best = m
      bestArea = area
      if (area === 0) break
    }
  }
  return { machine: best, area: bestArea }
}

/** Pas d'écartement essayés : téléphone (écart des blocs) et ordinateur (étirement vertical). */
export const PHONE_GAPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.65, 1.8, 2, 2.25, 2.5, 2.8, 3.2]
export const DESK_STRETCH = [1, 1.08, 1.16, 1.25, 1.35, 1.45, 1.6, 1.75]
/** Ordinateur : couples (écart horizontal, étirement vertical) essayés, du moins déformé au plus déformé. */
export const DESK_FITS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = []
  // Une disposition aplatie (y < 1) pousse ses postes vers les côtés, une étirée (y > 1) vers le haut et le bas.
  for (const x of [1, 1.15, 1.3, 1.5]) for (const y of [0.7, 0.85, 1, 1.2, 1.45]) out.push([x, y])
  return out.sort((a, b) => Math.abs(a[0] - 1) + Math.abs(a[1] - 1) - (Math.abs(b[0] - 1) + Math.abs(b[1] - 1)))
})()
