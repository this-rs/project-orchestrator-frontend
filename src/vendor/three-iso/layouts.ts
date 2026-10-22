// GENERATED from website@627d49eb05470cf08f848dcfa28876bf4ac962b7:src/three/iso/layouts.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Dispositions des machines de héros : OÙ poser les postes et la voie qui les relie, selon ce que l'en-tête veut dire.
 * Une même machine (des postes et leurs objets) se pose sur n'importe quelle disposition ; le cadrage (`fit.ts`) met
 * ensuite le tout dans la zone visible, sans débord.
 *
 *   ring     anneau autour du texte          un tout et ses parties (les capacités d'un produit)
 *   stadium  piste en rectangle arrondi      la même idée, qui remplit les écrans larges jusque dans les coins
 *   arch     arche de gauche à droite        une progression, des étapes dans l'ordre (comment ça marche, feuille de route)
 *   wings    deux ailes ( )                  deux côtés : avant/après, humain/agent, deux familles
 *   corners  quatre grappes dans les coins   un écosystème : des groupes autonomes reliés au centre
 *
 * Tout est en coordonnées d'écran du viewBox 1200 × 700, autour de la zone de texte (`compose.SAFE`) qui reste vide et
 * du repère de défilement (bas-centre). Une voie est une polyligne ; un arrêt est une position (voie, abscisse 0..1).
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import type { Vec2 } from './iso.ts'

export type LayoutKind = 'ring' | 'stadium' | 'arch' | 'wings' | 'corners' | 'solo' | 'phone' | 'compact'

export const LAYOUTS: readonly { kind: LayoutKind; purpose: string }[] = [
  { kind: 'ring', purpose: 'un tout et ses parties, autour du texte' },
  { kind: 'stadium', purpose: 'un tout et ses parties, en remplissant la largeur et les coins' },
  { kind: 'arch', purpose: 'une progression ordonnée, de gauche à droite' },
  { kind: 'wings', purpose: 'deux côtés en regard (avant/après, deux familles)' },
  { kind: 'corners', purpose: 'un écosystème de groupes autonomes' },
  { kind: 'solo', purpose: 'une seule mécanique, en gros plan (illustration de bloc, pas de héros)' },
  { kind: 'compact', purpose: 'sans texte à entourer (chat, bloc) : les postes en serpentin serré, sans trou central — variante automatique de toute scène' },
  { kind: 'phone', purpose: 'téléphone (portrait) : un bloc en serpentin au-dessus du texte, un autre en dessous — variante automatique de toute scène' },
]

export interface Track {
  /** Points de la voie (écran), denses : la voie est tracée segment par segment. */
  pts: Vec2[]
  closed: boolean
}

export interface Stop {
  track: number
  /** Abscisse curviligne sur la voie, 0..1. */
  t: number
}

export interface Layout {
  kind: LayoutKind
  tracks: Track[]
  /** Arrêts dans l'ordre de service (la navette les visite dans cet ordre). */
  stops: Stop[]
  /** Centre de l'espace libre (écran) : le texte du héros s'y centre (fit.ts cadre la scène autour de ce point). */
  hole: Vec2
}

const CX = 600
const CY = 372

/** Polyligne d'une ellipse de a0 à a1 (degrés écran, 0 = droite, 90 = bas). */
function ellipse(rx: number, ry: number, a0: number, a1: number, n: number, cx = CX, cy = CY): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const
  })
}

/** Rectangle arrondi (sens horaire à l'écran, départ au milieu du bord gauche). */
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, perCorner = 10): Vec2[] {
  const pts: Vec2[] = []
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= perCorner; i++) {
      const a = ((a0 + (90 * i) / perCorner) * Math.PI) / 180
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  arc(x0 + r, y0 + r, 180)
  arc(x1 - r, y0 + r, 270)
  arc(x1 - r, y1 - r, 0)
  arc(x0 + r, y1 - r, 90)
  return pts
}

/** Longueurs cumulées d'une polyligne (normalisées à 1). */
export function arcLengths(tr: Track): number[] {
  const p = tr.closed ? [...tr.pts, tr.pts[0]!] : tr.pts
  const L = [0]
  for (let i = 1; i < p.length; i++) L.push(L[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]))
  const tot = L[L.length - 1]!
  return L.map((v) => v / tot)
}

/** Point et direction de la voie à l'abscisse t (0..1). */
export function pointAt(tr: Track, t: number): { p: Vec2; dir: Vec2 } {
  const p = tr.closed ? [...tr.pts, tr.pts[0]!] : tr.pts
  const L = arcLengths(tr)
  const u = tr.closed ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t))
  let i = 1
  while (i < L.length - 1 && L[i]! < u) i++
  const a = p[i - 1]!
  const b = p[i]!
  const f = (u - L[i - 1]!) / (L[i]! - L[i - 1]! || 1)
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return { p: [a[0] + dx * f, a[1] + dy * f], dir: [dx / l, dy / l] }
}

/** Abscisse (0..1) du point de la voie le plus proche d'un point d'écran. */
function nearestT(tr: Track, q: Vec2): number {
  const p = tr.closed ? [...tr.pts, tr.pts[0]!] : tr.pts
  const L = arcLengths(tr)
  let best = 0
  let bd = Infinity
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!
    const b = p[i]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const f = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const d = Math.hypot(a[0] + dx * f - q[0], a[1] + dy * f - q[1])
    if (d < bd) {
      bd = d
      best = L[i - 1]! + (L[i]! - L[i - 1]!) * f
    }
  }
  return best
}

/** Abscisses de `n` arrêts sur une voie OUVERTE : les deux premiers et derniers sur les extrémités (le socle termine la voie). */
const openStops = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0.5 : i / (n - 1)))

/** Arrêts sur une ellipse aux angles d'écran donnés (degrés), dans l'ordre donné. */
function ellipseStops(tr: Track, rx: number, ry: number, degs: readonly number[]): Stop[] {
  return degs.map((d) => {
    const a = (d * Math.PI) / 180
    return { track: 0, t: nearestT(tr, [CX + rx * Math.cos(a), CY + ry * Math.sin(a)]) }
  })
}

/** Angles d'écran de `n` arrêts répartis autour d'un anneau, en laissant libre le bas-centre (repère de défilement). */
export function ringAngles(n: number, gap = 64): number[] {
  // De 90 + gap/2 à 90 + 360 − gap/2, dans le sens horaire de l'écran.
  const a0 = 90 + gap / 2
  const span = 360 - gap
  return Array.from({ length: n }, (_, i) => a0 + (span * (i + 0.5)) / n)
}

/**
 * Disposition `kind` pour `n` postes. `degs` (anneau seulement) impose des angles d'écran. `sx` (≥ 1) étire la disposition
 * en largeur autour du centre, pour un cadre plus large que haut (les objets, eux, ne sont jamais déformés).
 */
export function makeLayout(kind: LayoutKind, n: number, degs?: readonly number[], sx = 1, sy = 1): Layout {
  // Téléphone : `sy` écarte les deux blocs (l'espace du texte grandit), sans étirer les blocs eux-mêmes.
  if (kind === 'phone') return build(kind, n, degs, sy)
  const L = build(kind, n, degs, sx)
  if (sy === 1) return L
  // Étirement vertical autour du centre de l'espace libre : plus de place pour un texte haut ; objets non déformés.
  const cy = L.hole[1]
  return { ...L, tracks: L.tracks.map((t) => ({ ...t, pts: t.pts.map((q) => [q[0], cy + (q[1] - cy) * sy] as const) })) }
}

function stretch(pts: Vec2[], sx: number): Vec2[] {
  return sx === 1 ? pts : pts.map((p) => [CX + (p[0] - CX) * sx, p[1]] as const)
}

function build(kind: LayoutKind, n: number, degs: readonly number[] | undefined, sx: number): Layout {
  switch (kind) {
    case 'ring': {
      const RX = 452
      const RY = 250
      const tr: Track = { pts: ellipse(RX * sx, RY, 0, 360, 96).slice(0, -1), closed: true }
      return { kind, tracks: [tr], stops: ellipseStops(tr, RX * sx, RY, degs ?? ringAngles(n)), hole: [CX, CY] }
    }
    case 'stadium': {
      const tr: Track = { pts: roundRect(CX - 450 * sx, 122, CX + 450 * sx, 668, 150, 12), closed: true }
      // Arrêts répartis sur la piste en sautant le bas-centre (repère) : la piste part du milieu du bord gauche.
      const L = 1
      const gapC = nearestT(tr, [CX, 668])
      const gap = 0.07
      const stops: Stop[] = []
      for (let i = 0; i < n; i++) {
        const t = (gapC + gap / 2 + ((L - gap) * (i + 0.5)) / n) % 1
        stops.push({ track: 0, t })
      }
      return { kind, tracks: [tr], stops: stops.sort((a, b) => a.t - b.t), hole: [CX, 384] }
    }
    case 'arch': {
      // Une arche ∩ : du bas-gauche au bas-droit en passant au-dessus du texte.
      const tr: Track = { pts: stretch(ellipse(490, 330, 162, 378, 90, CX, 455), sx), closed: false }
      return { kind, tracks: [tr], stops: openStops(n).map((t) => ({ track: 0, t })), hole: [CX, 400] }
    }
    case 'wings': {
      // Deux ailes en parenthèses, chacune parcourue de haut en bas ; la navette passe de l'une à l'autre.
      const left: Track = { pts: stretch(ellipse(420, 290, 228, 132, 40), sx), closed: false }
      const right: Track = { pts: stretch(ellipse(420, 290, -48, 48, 40), sx), closed: false }
      const nl = Math.ceil(n / 2)
      const nr = n - nl
      const stops: Stop[] = [
        ...openStops(nl).map((t) => ({ track: 0, t })),
        ...openStops(nr).map((t) => ({ track: 1, t })),
      ]
      return { kind, tracks: [left, right], stops, hole: [CX, CY] }
    }
    case 'compact': {
      // Pas de texte au centre : un serpentin serré, au plus 4 postes par rang (3 si n ≤ 6), rangs alternés.
      const per = n <= 4 ? n : n <= 6 ? 3 : 4
      const rows = Math.ceil(n / per)
      const DX = 240
      const ROW = 200
      const pts: Vec2[] = []
      const at: Vec2[] = []
      for (let r = 0; r < rows; r++) {
        const cnt = Math.min(per, n - r * per)
        const y = CY + (r - (rows - 1) / 2) * ROW
        const xs = Array.from({ length: cnt }, (_, i) => CX + (i - (per - 1) / 2) * DX)
        const ltr = r % 2 === 0
        const ordered = ltr ? xs : [...xs].reverse()
        const edge = CX + ((per - 1) / 2) * DX + 120
        const from = r === 0 ? (ltr ? xs[0]! - 120 : xs[xs.length - 1]! + 120) : ltr ? CX - edge + CX : edge
        const to = r === rows - 1 ? (ltr ? xs[xs.length - 1]! + 120 : xs[0]! - 120) : ltr ? edge : CX - (edge - CX)
        pts.push([from, y], [to, y])
        for (const x of ordered) at.push([x, y])
      }
      const tr: Track = { pts, closed: false }
      return { kind, tracks: [tr], stops: at.map((q) => ({ track: 0, t: nearestT(tr, q) })), hole: [CX, CY] }
    }
    case 'phone': {
      // Portrait : deux serpentins (au plus trois postes par rang), l'un au-dessus du texte, l'autre en dessous ; la
      // navette passe de l'un à l'autre. Le trou (texte) est grand : sur téléphone le texte prend la moitié de l'écran.
      const top = Math.ceil(n / 2)
      const bottom = n - top
      // Demi-hauteur de l'espace laissé au texte (unités du viewBox) ; `sx` l'agrandit quand le texte de la page est haut.
      const GAP = 420 * sx
      const ROW = 190
      const snake = (k: number, y0: number, dir: 1 | -1): { tr: Track; stops: number[] } => {
        const rows: number[] = []
        for (let left = k; left > 0; left -= 3) rows.push(Math.min(3, left))
        const pts: Vec2[] = []
        const at: Vec2[] = []
        rows.forEach((cnt, r) => {
          const y = y0 + dir * r * ROW
          const ltr = r % 2 === 0
          const xs = Array.from({ length: cnt }, (_, i) => CX + ((i - (cnt - 1) / 2) * 230))
          const ordered = ltr ? xs : [...xs].reverse()
          // Le rang va du premier poste (avec une courte amorce) jusqu'au virage, toujours du même côté.
          const lo = Math.min(...xs) - 120
          const turn = r % 2 === 0 ? CX + 330 : CX - 330
          const from = r === 0 ? (ltr ? lo : Math.max(...xs) + 120) : r % 2 === 0 ? CX - 330 : CX + 330
          const to = r === rows.length - 1 ? (ltr ? Math.max(...xs) + 120 : lo) : turn
          pts.push([from, y], [to, y])
          for (const x of ordered) at.push([x, y])
        })
        const tr: Track = { pts, closed: false }
        return { tr, stops: at.map((q) => nearestT(tr, q)) }
      }
      const a = snake(top, CY - GAP - ROW * (Math.ceil(top / 3) - 1), 1)
      const b = snake(bottom, CY + GAP, 1)
      const stops: Stop[] = [...a.stops.map((t) => ({ track: 0, t })), ...b.stops.map((t) => ({ track: 1, t }))]
      return { kind, tracks: bottom ? [a.tr, b.tr] : [a.tr], stops, hole: [CX, CY] }
    }
    case 'solo': {
      // Un poste en gros plan sur un court tronçon de voie (illustration d'un bloc de page).
      const tr: Track = { pts: [[CX - 110 * sx, CY + 40], [CX + 110 * sx, CY - 40]], closed: false }
      return { kind, tracks: [tr], stops: [{ track: 0, t: 0.5 }], hole: [CX, CY] }
    }
    case 'corners': {
      // Quatre courtes voies en quart de cercle, une par coin, tournées vers le centre.
      const q = (cx: number, cy: number, a0: number): Track => ({ pts: stretch(ellipse(230, 175, a0, a0 + 90, 20, cx, cy), sx), closed: false })
      const tracks = [q(360, 300, 180), q(840, 300, 270), q(840, 420, 0), q(360, 420, 90)]
      const per = [0, 0, 0, 0]
      for (let i = 0; i < n; i++) per[i % 4]!++
      const stops: Stop[] = []
      tracks.forEach((_, k) => {
        for (const t of openStops(per[k]!)) stops.push({ track: k, t })
      })
      return { kind, tracks, stops, hole: [CX, 360] }
    }
  }
}
