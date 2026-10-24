// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/pins.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Étiquettes ancrées (« pins ») d'une machine dessinée en WebGL : un point de l'ARBRE de construction (le même repère
 * que les `at` du JSON qu'on a donné : z = 0 au sol de la machine `bare`, ou au dessus du socle) devient un point monde
 * (`treeToWorld`, le repère du poste, `MachineDef.treeFrames`), puis un pixel de l'image (`projectPins`, la MÊME
 * matrice vue-projection que le rendu), et `declutter` choisit les étiquettes qui ne se recouvrent pas.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { xf, type LAMP, type Mat3, type Vec3 } from './iso.ts'
import { basis, toScreen, type CameraState } from './camera.ts'

export interface Pin {
  id: string
  /** Point de l'arbre de construction du poste (mêmes unités que les `at` de l'arbre). */
  at: readonly [number, number, number]
  label: string
  tone?: keyof typeof LAMP | 'accent' | undefined
  /** Texte de l'infobulle (survol ou focus). */
  detail?: string | undefined
  /** Poste dont c'est l'arbre (défaut : 0). */
  station?: number | undefined
}

export interface TreeFrame {
  pos: Vec3
  rot: Mat3
  k: number
}

/** Point de l'arbre → point monde : pos + rot · (k · p), comme `Frame.sub` / `drawTree` posent une forme. */
export function treeToWorld(f: TreeFrame, p: readonly [number, number, number]): Vec3 {
  return xf(f.rot, [p[0] * f.k, p[1] * f.k, p[2] * f.k], f.pos)
}

/** Une étiquette projetée : pixels CSS du canvas, `w` du clip (≤ 0 : derrière l'œil), profondeur relative. */
export interface Placed {
  x: number
  y: number
  /** 1 = l'étiquette la plus proche de l'œil, 0 = la plus lointaine (parmi celles qu'on projette : l'écart de profondeur
   * entre étiquettes, pas celui de la scène entière, que le sol écrase). */
  near: number
  /** Dans l'image et devant l'œil. */
  inside: boolean
}

/** Marge (px) hors de l'image au-delà de laquelle une étiquette est masquée (pas de clamp : elle disparaît). */
export const EDGE_PAD = 6

/**
 * Projette les points monde des étiquettes avec la matrice de la dernière image (`M`, caméra `cam`, cible `T`) sur un
 * canvas CSS de `w` × `h`. `near` sert à estomper l'autre côté de la machine.
 */
export function projectPins(world: readonly Vec3[], M: Float32Array, cam: Pick<CameraState, 'yaw' | 'pitch'>, T: Vec3, w: number, h: number): Placed[] {
  const { eye } = basis(cam.yaw, cam.pitch)
  const scr = world.map((p) => toScreen(M, p, w, h))
  const depth = world.map((p) => (p[0] - T[0]) * eye[0] + (p[1] - T[1]) * eye[1] + (p[2] - T[2]) * eye[2])
  // L'écart de profondeur se mesure entre les étiquettes devant l'œil (une étiquette derrière lui ne doit pas l'écraser).
  let lo = Infinity
  let hi = -Infinity
  depth.forEach((c, i) => {
    if (!(scr[i]!.w > 0) || !Number.isFinite(c)) return
    if (c < lo) lo = c
    if (c > hi) hi = c
  })
  const span = hi - lo
  return world.map((_, i) => {
    const s = scr[i]!
    const near = span > 1e-9 ? Math.min(1, Math.max(0, (depth[i]! - lo) / span)) : 1
    const inside = s.w > 0 && s.x >= -EDGE_PAD && s.x <= w + EDGE_PAD && s.y >= -EDGE_PAD && s.y <= h + EDGE_PAD
    return { x: s.x, y: s.y, near, inside }
  })
}

/** Opacité d'une étiquette selon sa profondeur : le fond de la scène s'estompe, jamais jusqu'à disparaître. */
export const fadeOf = (near: number): number => 0.38 + 0.62 * near

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Hauteur d'une puce d'étiquette (px) et largeur estimée d'une chaîne en police à chasse fixe 11 px. */
export const CHIP_H = 20
export const DOT = 10
export const chipWidth = (label: string): number => Math.ceil(label.length * 6.6) + 18

/** Le rectangle (point + puce, à droite du point, 4 px d'écart) d'une étiquette posée en (x, y), pour le test de recouvrement. */
export function pinRect(x: number, y: number, chipW: number): Rect {
  return { x: x - DOT / 2, y: y - CHIP_H / 2, w: DOT + 4 + chipW, h: CHIP_H }
}

const hit = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

/**
 * Choix glouton : les étiquettes sont prises DANS L'ORDRE (le rang dans la liste = la priorité) ; une étiquette
 * visible (`want[i]`) est montrée si son rectangle ne touche aucun rectangle déjà retenu (à `gap` px près). Rend, pour
 * chacune, si sa puce est montrée (sinon le point seul reste). O(n · retenues) : 60 étiquettes = quelques milliers de tests.
 */
export function declutter(rects: readonly Rect[], want: readonly boolean[], gap = 3): boolean[] {
  const kept: Rect[] = []
  return rects.map((r, i) => {
    if (!want[i]) return false
    for (const k of kept) if (hit(r, k, gap)) return false
    kept.push(r)
    return true
  })
}
