// GENERATED from website@8edc84d47096978e049137e0b5fa32b9dffb4360:src/three/iso/layouts.ts by scripts/sync-iso-lib.mjs — do not edit.
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

/** Demi-axes de l'anneau (pixels du viewBox) pour `n` postes. Voir `ringCap` pour la taille des postes. */
export function ringShape(n: number): { rx: number; ry: number } {
  const o = (globalThis as any).__ring; if (o) return o(n)
  // t = 0 à six postes et plus (la forme historique, mesurée), 1 à deux postes et moins : l'anneau se resserre.
  const t = Math.min(1, Math.max(0, (RING_FULL_N - n) / (RING_FULL_N - RING_TIGHT_N)))
  return { rx: RING_RX + (RING_TIGHT_RX - RING_RX) * t, ry: RING_RY + (RING_TIGHT_RY - RING_RY) * t }
}
/** Six postes et plus : demi-axes de l'anneau historique, 452 × 250 px (l'anneau qui entoure la zone de texte). */
const RING_FULL_N = 6
const RING_RX = 452
const RING_RY = 250
/** Deux postes et moins : l'anneau le plus serré.
 *  – ry = 204 = 182 × 1,12 : le demi-axe vertical de la zone de texte protégée (`compose.SAFE`, 182 px, ellipse centrée en
 *    y = 350) gonflé de 12 % ; l'anneau est centré en y = 372, donc le poste du haut est à 168 et reste hors de l'ellipse.
 *  – rx = 435, MESURÉ et non dérivé : à 417 (372 × 1,12) la machine de scene.test (consent-gate sur le poste de flanc, quatre
 *    postes) voit une pièce passer sous le texte, car la pièce la plus large d'un poste de flanc s'étend d'environ 70 px vers
 *    l'intérieur (x = 964 < 972, bord droit de l'ellipse) ; à 435 la scène passe, 452 est l'anneau historique. */
const RING_TIGHT_N = 2
const RING_TIGHT_RX = 435
const RING_TIGHT_RY = Math.round(182 * 1.12)
/**
 * Forme de l'arche pour `n` postes : demi-ellipse de centre (CX, cy), demi-axes (rx, ry), de 270° − phi à 270° + phi
 * (degrés écran). À six postes et plus : l'arche historique (centre (600, 455), 490 × 330, phi = 108°, extrémités à 557 et
 * sommet à 125). À trois postes et moins : l'arche SERRÉE, dont chaque nombre vient de la zone de texte `compose.SAFE`
 * (ellipse de demi-axes 372 × 182 centrée en (600, 350) : 700 × (0,24 + 0,76) / 2 ; aucun centre de poste ne doit y tomber) :
 *   – sommet à 350 − 182 = 168 : le poste du sommet est TANGENT au haut de l'ellipse (sa mécanique, dont le centre de masse est au-dessus du socle, sort de l'ellipse de ≈ 4 px) ;
 *   – extrémités à x = 600 ± 430 : MESURÉ. À ±400 la scène chain-arch-3 de la galerie (stair-procedure en bout, échelle 3,3) est
 *     refusée, une pièce à x = 954 passant dans l'ellipse (bord droit : 972) : la pièce la plus large d'un poste d'extrémité
 *     s'étend de 46 px vers l'intérieur, d'où x_poste ≥ 972 + 46 = 1018, soit ±418 ; 430 ajoute 12 px de jeu. Les extrémités
 *     sont à y = 430, 80 px sous le centre du texte ;
 * Entre trois et six postes, interpolation linéaire de chaque nombre (la forme se resserre progressivement).
 */
export function archShape(n: number): { rx: number; ry: number; cy: number; phi: number } {
  const o = (globalThis as any).__arch; if (o) return o(n)
  const t = Math.min(1, Math.max(0, (ARCH_FULL_N - n) / (ARCH_FULL_N - ARCH_TIGHT_N)))
  const mix = (a: number, b: number) => a + (b - a) * t
  return { rx: mix(490, ARCH_TIGHT_RX), ry: mix(330, ARCH_TIGHT_CY - ARCH_TIGHT_APEX), cy: mix(455, ARCH_TIGHT_CY), phi: mix(108, 90) }
}
const ARCH_FULL_N = 6
const ARCH_TIGHT_N = 3
const ARCH_TIGHT_APEX = 350 - 182
const ARCH_TIGHT_RX = 430
const ARCH_TIGHT_CY = 430
/**
 * Plafond d'échelle des postes d'une arche : 3,0 (`POST_SCALE`, la valeur historique) à six postes et plus, + 0,1 par poste
 * en moins, au plus 3,4. Le plafond de 3,4 vient de la hauteur : le poste du sommet est à y = 168 (`archShape`) et le
 * plus haut objet de la bibliothèque (knowledge-graph, h = 3,35) monte de 13 × (0,62 + 3,35) × 3,4 = 175 px au-dessus,
 * soit un sommet à y ≈ −7 : au-delà de 3,0 c'est la clause de contenance de stations.ts (échelle bornée par le viewBox)
 * qui réduit l'échelle de CE poste-là ; le plafond ne fait que borner les autres.
 */
export function archCap(n: number): number {
  return Math.min(3.4, 3.0 + 0.1 * Math.max(0, 6 - n))
}
/** Plafond d'échelle des postes d'un anneau : plus il y en a peu, plus chacun grossit (2,3 à six postes + 0,45 par poste en moins,
 * au plus 3,6). Inchangé : relevé à 2,7 il fait entrer une pièce de flanc dans l'ellipse de texte SAFE (essayé et refusé par
 * scene.test, x = 960 < 972). */
export function ringCap(n: number): number {
  return Math.min(3.6, 2.3 + 0.45 * Math.max(0, 6 - n))
}

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
export function ringAngles(n: number, gap = 64, rx?: number, ry?: number): number[] {
  // De 90 + gap/2 à 90 + 360 − gap/2, dans le sens horaire de l'écran.
  const a0 = 90 + gap / 2
  const span = 360 - gap
  if (rx === undefined || ry === undefined) return Array.from({ length: n }, (_, i) => a0 + (span * (i + 0.5)) / n)
  // Demi-axes connus : les arrêts sont à ARC égal (et non à angle égal). À angle égal, un pas vaut ≈ ry·Δ sur les flancs
  // et ≈ rx·Δ en haut : les deux postes de chaque flanc se retrouvent empilés l'un sur l'autre (l'empreinte d'un poste est
  // bien plus haute que large), c'est eux qui bornaient l'échelle (2,11 à six postes). L'arc est intégré par pas de 0,25°.
  const STEP = 0.25
  const m = Math.round(span / STEP)
  const cum = [0]
  for (let k = 1; k <= m; k++) {
    const a = ((a0 + (k - 0.5) * STEP) * Math.PI) / 180
    cum.push(cum[k - 1]! + Math.hypot(rx * Math.sin(a), ry * Math.cos(a)) * ((STEP * Math.PI) / 180))
  }
  const tot = cum[m]!
  return Array.from({ length: n }, (_, i) => {
    const want = (tot * (i + 0.5)) / n
    let k = 1
    while (k < m && cum[k]! < want) k++
    const f = (want - cum[k - 1]!) / (cum[k]! - cum[k - 1]! || 1)
    return a0 + (k - 1 + f) * STEP
  })
}

/**
 * Empreinte projetée d'un poste, MESURÉE (pixels du viewBox 1200 × 700) : `hx` la demi-largeur, `hy` la demi-hauteur du
 * rectangle qu'un poste occupe réellement à l'écran (le socle, plus son objet qui monte au-dessus). C'est la boîte que
 * `fit.stationBoxes` rend pour un poste, ramenée au viewBox (hx = demi-largeur, hy = demi-hauteur du rectangle) — une
 * mesure, pas une constante devinée.
 */
export interface PostBox {
  hx: number
  hy: number
}

/**
 * Marge NOMÉE (pixels du viewBox) exigée entre deux empreintes de postes voisines : le jour qu'on veut voir entre deux
 * postes, quel que soit leur contenu. C'est LE nombre de la règle « fix collisions with a number » : on n'éloigne pas la
 * caméra, on impose cet écart dans la disposition.
 */
export const POST_MARGIN = 24

/** Écart minimal entre deux centres de postes voisins — horizontal dans un rang, vertical entre deux rangs — pour que
 * deux empreintes `box` ne se touchent pas, avec la marge `margin`. Le calcul vient de la mesure, pas d'une devinette. */
export function spacingFor(box: PostBox, margin = POST_MARGIN): { dx: number; dy: number } {
  return { dx: 2 * box.hx + margin, dy: 2 * box.hy + margin }
}

/**
 * Constantes de repli (pixels du viewBox) pour les deux dispositions SANS trou de texte (`compact`, `phone`), dont
 * l'écartement est libre. Elles étaient devinées historiquement ; elles ne servent PLUS QUE lorsque l'empreinte réelle
 * d'un poste n'est pas encore mesurable au moment de construire la disposition (voir `makeLayout`).
 */
const FALLBACK: Readonly<Record<'compact' | 'phone', { dx: number; dy: number }>> = {
  compact: { dx: 240, dy: 200 },
  phone: { dx: 230, dy: 190 },
}

/** Écartement d'un rang : dérivé de l'empreinte mesurée quand elle est fournie, sinon du repli deviné. */
function spacing(kind: 'compact' | 'phone', box: PostBox | undefined, margin: number): { dx: number; dy: number } {
  return box ? spacingFor(box, margin) : FALLBACK[kind]
}

/**
 * Disposition `kind` pour `n` postes. `degs` (anneau seulement) impose des angles d'écran. `sx` (≥ 1) étire la disposition
 * en largeur autour du centre, pour un cadre plus large que haut (les objets, eux, ne sont jamais déformés).
 *
 * ÉCARTEMENT : cette variante emploie les constantes de repli, car l'empreinte réelle d'un poste n'est PAS mesurable ici
 * — elle dépend de l'échelle du poste, qui est choisie dans `stations.ts` À PARTIR de cet écartement (cercle vicieux).
 * Pour imposer un écart dérivé d'une empreinte MESURÉE, appeler `makeLayoutSpaced` avec la boîte du poste.
 */
export function makeLayout(kind: LayoutKind, n: number, degs?: readonly number[], sx = 1, sy = 1): Layout {
  return layout(kind, n, degs, sx, sy, undefined, POST_MARGIN)
}

/**
 * Comme `makeLayout`, mais l'écartement des postes est DÉRIVÉ de `box` (l'empreinte projetée mesurée d'un poste) avec la
 * marge nommée `margin`, au lieu des constantes devinées. Ne concerne que `compact` et `phone` (les seules dispositions
 * sans trou de texte, où l'écart est libre) ; les autres gardent leur géométrie, qui est fixée par le trou du texte et
 * n'a pas d'écart « deviné » à corriger. L'appelant doit fournir une boîte mesurée (ex. `fit.stationBoxes` ramené au
 * viewBox) ; si la mesure n'existe pas encore, garder `makeLayout`.
 */
export function makeLayoutSpaced(
  kind: LayoutKind,
  n: number,
  box: PostBox,
  margin = POST_MARGIN,
  degs?: readonly number[],
  sx = 1,
  sy = 1,
): Layout {
  return layout(kind, n, degs, sx, sy, box, margin)
}

function layout(
  kind: LayoutKind,
  n: number,
  degs: readonly number[] | undefined,
  sx: number,
  sy: number,
  box: PostBox | undefined,
  margin: number,
): Layout {
  // Téléphone : `sy` écarte les deux blocs (l'espace du texte grandit), sans étirer les blocs eux-mêmes.
  if (kind === 'phone') return build(kind, n, degs, sy, box, margin)
  const L = build(kind, n, degs, sx, box, margin)
  if (sy === 1) return L
  // Étirement vertical autour du centre de l'espace libre : plus de place pour un texte haut ; objets non déformés.
  const cy = L.hole[1]
  return { ...L, tracks: L.tracks.map((t) => ({ ...t, pts: t.pts.map((q) => [q[0], cy + (q[1] - cy) * sy] as const) })) }
}

function stretch(pts: Vec2[], sx: number): Vec2[] {
  return sx === 1 ? pts : pts.map((p) => [CX + (p[0] - CX) * sx, p[1]] as const)
}

function build(kind: LayoutKind, n: number, degs: readonly number[] | undefined, sx: number, box: PostBox | undefined, margin: number): Layout {
  switch (kind) {
    case 'ring': {
      const { rx: RX, ry: RY } = ringShape(n)
      const tr: Track = { pts: ellipse(RX * sx, RY, 0, 360, 96).slice(0, -1), closed: true }
      return { kind, tracks: [tr], stops: ellipseStops(tr, RX * sx, RY, degs ?? ringAngles(n, 64, RX * sx, RY)), hole: [CX, CY] }
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
      const A = archShape(n)
      const tr: Track = { pts: stretch(ellipse(A.rx, A.ry, 270 - A.phi, 270 + A.phi, 90, CX, A.cy), sx), closed: false }
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
      // Écartement dérivé de l'empreinte MESURÉE d'un poste (avec sa marge nommée) quand elle est fournie, sinon du repli.
      const { dx, dy } = spacing('compact', box, margin)
      const AMORCE = 120 // courte amorce de voie avant le premier poste et après le dernier (chemin, pas un écart de postes)
      const pts: Vec2[] = []
      const at: Vec2[] = []
      for (let r = 0; r < rows; r++) {
        const cnt = Math.min(per, n - r * per)
        const y = CY + (r - (rows - 1) / 2) * dy
        const xs = Array.from({ length: cnt }, (_, i) => CX + (i - (per - 1) / 2) * dx)
        const ltr = r % 2 === 0
        const ordered = ltr ? xs : [...xs].reverse()
        const edge = CX + ((per - 1) / 2) * dx + AMORCE
        const from = r === 0 ? (ltr ? xs[0]! - AMORCE : xs[xs.length - 1]! + AMORCE) : ltr ? CX - edge + CX : edge
        const to = r === rows - 1 ? (ltr ? xs[xs.length - 1]! + AMORCE : xs[0]! - AMORCE) : ltr ? edge : CX - (edge - CX)
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
      // Écartement dérivé de l'empreinte MESURÉE d'un poste (avec sa marge nommée) quand elle est fournie, sinon du repli.
      const { dx, dy } = spacing('phone', box, margin)
      const AMORCE = 120 // courte amorce de voie avant le premier poste (chemin, pas un écart de postes)
      const TURN = 330 // écart du virage (chemin du serpentin, pas un écart de postes)
      const snake = (k: number, y0: number, dir: 1 | -1): { tr: Track; stops: number[] } => {
        const rows: number[] = []
        for (let left = k; left > 0; left -= 3) rows.push(Math.min(3, left))
        const pts: Vec2[] = []
        const at: Vec2[] = []
        rows.forEach((cnt, r) => {
          const y = y0 + dir * r * dy
          const ltr = r % 2 === 0
          const xs = Array.from({ length: cnt }, (_, i) => CX + ((i - (cnt - 1) / 2) * dx))
          const ordered = ltr ? xs : [...xs].reverse()
          // Le rang va du premier poste (avec une courte amorce) jusqu'au virage, toujours du même côté.
          const lo = Math.min(...xs) - AMORCE
          const turn = r % 2 === 0 ? CX + TURN : CX - TURN
          const from = r === 0 ? (ltr ? lo : Math.max(...xs) + AMORCE) : r % 2 === 0 ? CX - TURN : CX + TURN
          const to = r === rows.length - 1 ? (ltr ? Math.max(...xs) + AMORCE : lo) : turn
          pts.push([from, y], [to, y])
          for (const x of ordered) at.push([x, y])
        })
        const tr: Track = { pts, closed: false }
        return { tr, stops: at.map((q) => nearestT(tr, q)) }
      }
      const a = snake(top, CY - GAP - dy * (Math.ceil(top / 3) - 1), 1)
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
