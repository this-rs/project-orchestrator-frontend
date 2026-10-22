// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/compose.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Cadre du héros pour une machine : le viewBox 1200 × 700 des scènes (components/hero/safeZone.ts), la projection
 * d'un point monde vers ce viewBox, et les contrôles de composition que chaque machine doit passer (tests) :
 *   - SAFE  : aucune pièce pleine (hors `under`) n'a son centre dans l'ellipse de texte ;
 *   - FRAME : le centre de toute pièce pleine est dans x ∈ [4 %, 96 %]. Sur ordinateur la machine entière est cadrée dans
 *             la zone visible (fit.ts) ; la borne ne sert plus qu'au pli téléphone, qui montre le viewBox de bord à bord ;
 *   - CUE   : rien de plein au bas-centre (repère de défilement) ;
 *   - PLI   : chaque moitié (x < 600 / x ≥ 600) porte au moins 30 % des pièces (téléphone : la scène est pliée).
 *
 * Module PUR, sans import `@/` : lu par Node dans les tests.
 */
import { proj, type Face, type Vec2, type Vec3 } from './iso.ts'
import type { MachineDef } from './machine.ts'

export const W = 1200
export const H = 700
/** Zone de texte protégée (fractions du viewBox) : mêmes valeurs que components/hero/safeZone.ts. */
export const SAFE = { x0: 0.19, x1: 0.81, y0: 0.24, y1: 0.76 } as const
export const FRAME = { x0: 0.04, x1: 0.96 } as const
export const CUE = { x0: 0.475, x1: 0.525, y0: 0.9 } as const

/** Point monde → pixels du viewBox. */
export function toView(m: Pick<MachineDef, 'U' | 'origin'>, p: Vec3): Vec2 {
  const q = proj(p)
  return [m.origin[0] + q[0] * m.U, m.origin[1] + q[1] * m.U]
}

/** Pixels du viewBox → point du sol (z donné) : pour poser une pièce là où la scène actuelle posait un nœud. */
export function fromView(m: Pick<MachineDef, 'U' | 'origin'>, x: number, y: number, z = 0): Vec3 {
  const px = (x - m.origin[0]) / m.U
  const py = (y - m.origin[1]) / m.U
  // proj : X = (a − b)·cos30 ; Y = (a + b)/2 − z
  const d = px / Math.cos(Math.PI / 6)
  const s = (py + z) * 2
  return [(s + d) / 2, (s - d) / 2, z]
}

export interface Centroid {
  part: number
  x: number
  y: number
}

/** Centre projeté de chaque pièce présente dans `faces` (moyenne de ses sommets). */
export function centroids(m: Pick<MachineDef, 'U' | 'origin'>, faces: readonly Face[]): Centroid[] {
  const acc = new Map<number, { x: number; y: number; n: number }>()
  for (const f of faces) {
    let a = acc.get(f.part)
    if (!a) {
      a = { x: 0, y: 0, n: 0 }
      acc.set(f.part, a)
    }
    for (const p of f.pts) {
      const v = toView(m, p)
      a.x += v[0]
      a.y += v[1]
      a.n++
    }
  }
  return [...acc].map(([part, a]) => ({ part, x: a.x / a.n, y: a.y / a.n }))
}

export interface Violation {
  rule: 'SAFE' | 'FRAME' | 'CUE'
  part: number
  name: string
  x: number
  y: number
}

/** Contrôles de composition à l'instant canonique. Retourne les violations (vide = conforme). */
export function checkComposition(m: MachineDef, faces: readonly Face[]): Violation[] {
  const out: Violation[] = []
  const cx = (W * (SAFE.x0 + SAFE.x1)) / 2
  const cy = (H * (SAFE.y0 + SAFE.y1)) / 2
  const rx = (W * (SAFE.x1 - SAFE.x0)) / 2
  const ry = (H * (SAFE.y1 - SAFE.y0)) / 2
  for (const c of centroids(m, faces)) {
    const def = m.parts[c.part]!
    const v = (rule: Violation['rule']) => out.push({ rule, part: c.part, name: def.name, x: Math.round(c.x), y: Math.round(c.y) })
    if (!def.under && ((c.x - cx) / rx) ** 2 + ((c.y - cy) / ry) ** 2 < 1) v('SAFE')
    if (c.x < FRAME.x0 * W || c.x > FRAME.x1 * W) v('FRAME')
    if (c.x > CUE.x0 * W && c.x < CUE.x1 * W && c.y > CUE.y0 * H) v('CUE')
  }
  return out
}

/** Part des pièces dans chaque moitié (pli téléphone) : [gauche, droite], fractions de 0 à 1. */
export function halves(m: MachineDef, faces: readonly Face[]): [number, number] {
  const cs = centroids(m, faces)
  if (cs.length === 0) return [0, 0]
  const left = cs.filter((c) => c.x < W / 2).length
  return [left / cs.length, (cs.length - left) / cs.length]
}
