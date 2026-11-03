// GENERATED from website@1db50e5baba8e2e6af3d32dc6c1967fcb1f93c57:src/three/iso/parts.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Lire une pièce dans une scène : l'ISOLER (ne garder qu'elle, le reste en fantôme) et l'ÉCLATER (écarter les pièces
 * du centre, pour voir ce qui est derrière). Ce sont des transformations de FACES, donc elles valent pour les deux
 * rendus — le WebGL et le repli SVG — sans que l'un puisse diverger de l'autre.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import type { Face, Vec3 } from './iso.ts'
import type { MachineDef } from './machine.ts'

/** Ce qu'on demande au rendu : `isolate` (noms de pièces à garder en pleine matière) et `explode` (0 = rien). */
export interface PartsView {
  readonly isolate?: readonly string[] | undefined
  readonly explode?: number | undefined
  /** Coupe : on garde le côté dont la coordonnée `axis` est INFÉRIEURE à `at` (unités monde de la machine). */
  readonly cutaway?: { readonly axis: 'x' | 'y' | 'z'; readonly at: number } | undefined
}

/** Opacité d'une pièce écartée par `isolate` : présente, mais effacée — le contexte reste lisible. */
const GHOST = 0.2
/** Couleur d'une pièce effacée : un gris pâle, pour que sa silhouette reste lisible sur un fond sombre. */
const GHOST_COL = '#8b93a8'
/** Écart maximal, en unités monde, pour `explode = 1`. */
const EXPLODE_MAX = 1.6

/**
 * Découpe un polygone convexe par un demi-espace `coord <= at` (Sutherland–Hodgman), en gardant son ordre de sommets :
 * un triangle coupé devient un quadrilatère, jamais un décalage de faces. Les coordonnées sont celles de la machine.
 */
function clipPolygon(pts: readonly Vec3[], axis: 0 | 1 | 2, at: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    const da = a[axis] - at
    const db = b[axis] - at
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const k = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k])
    }
  }
  return out
}

const AXIS = { x: 0, y: 1, z: 2 } as const

const centroid = (f: Face): Vec3 => {
  let x = 0
  let y = 0
  let z = 0
  for (const p of f.pts) {
    x += p[0]
    y += p[1]
    z += p[2]
  }
  const n = Math.max(1, f.pts.length)
  return [x / n, y / n, z / n]
}

/** Centre de la scène : moyenne des centres de pièces, pondérée par leur nombre de faces (stable, sans dépendre du cadrage). */
function centreOf(faces: readonly Face[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  let w = 0
  for (const f of faces) {
    const c = centroid(f)
    const k = f.pts.length
    x += c[0] * k
    y += c[1] * k
    z += c[2] * k
    w += k
  }
  return w ? [x / w, y / w, z / w] : [0, 0, 0]
}

/** Le nom de la pièce d'une face, s'il existe (les faces du décor n'en ont pas toujours). */
function nameOf(m: MachineDef, part: number): string | null {
  return m.parts[part]?.name ?? null
}

/**
 * Applique `isolate` puis `explode` à des faces. Les faces ne sont jamais jetées par `isolate` : celles qui ne sont
 * pas nommées passent en FANTÔME (opacité réduite, sans émission) — on voit la pièce ET sa place.
 *
 * Aucune allocation quand la vue est vide : `faces` est rendu tel quel, donc un rendu sans vue ne paie rien.
 */
export function applyParts(input: readonly Face[], m: MachineDef, view: PartsView | undefined): readonly Face[] {
  let faces = input
  if (!view) return faces
  const keep = view.isolate && view.isolate.length ? new Set(view.isolate) : null
  const amount = Math.max(0, Math.min(1, view.explode ?? 0)) * EXPLODE_MAX
  const cut = view.cutaway
  if (!keep && !amount && !cut) return faces
  // Coupe d'abord : elle retire de la matière, donc elle précède l'isolement et l'éclatement (sinon on éclaircit des
  // faces qu'on jette juste après).
  if (cut) {
    const ax = AXIS[cut.axis]
    const kept: Face[] = []
    for (const f of faces) {
      const pts = clipPolygon(f.pts, ax, cut.at)
      if (pts.length >= 3) kept.push({ ...f, pts })
    }
    faces = kept
  }
  const centre = amount ? centreOf(faces) : [0, 0, 0]
  // L'éclatement est PAR PIÈCE, pas par face : translater chaque triangle séparément déchire une sphère en morceaux.
  // On calcule donc un décalage unique par pièce, et toutes ses faces le suivent (translation rigide).
  const shift = new Map<number, Vec3>()
  if (amount) {
    const acc = new Map<number, { c: Vec3; n: number }>()
    for (const f of faces) {
      const c = centroid(f)
      const a = acc.get(f.part) ?? { c: [0, 0, 0] as Vec3, n: 0 }
      acc.set(f.part, { c: [a.c[0] + c[0] * f.pts.length, a.c[1] + c[1] * f.pts.length, a.c[2] + c[2] * f.pts.length], n: a.n + f.pts.length })
    }
    for (const [part, a] of acc) {
      const c: Vec3 = [a.c[0] / a.n, a.c[1] / a.n, a.c[2] / a.n]
      const dx = c[0] - centre[0]
      const dy = c[1] - centre[1]
      const dz = c[2] - centre[2]
      const d = Math.hypot(dx, dy, dz) || 1
      const k = (amount * (0.35 + 0.65 * (d / (d + 1)))) / d
      shift.set(part, [dx * k, dy * k, dz * k])
    }
  }
  // Un auteur écrit "corps", pas "1. chat-1bikv3t-1 · corps" (le préfixe porte l'identifiant de scène, qui change
  // à chaque version). On adresse donc une pièce par la FIN de son nom — après le dernier « · ».
  const matches = (name: string | null): boolean => name !== null && (keep!.has(name) || [...keep!].some((w) => name.endsWith(' · ' + w)))
  return faces.map((f) => {
    const name = nameOf(m, f.part)
    let out = f
    if (keep) {
      // Fantôme = gris pâle translucide, pas la couleur d'origine : une pièce SOMBRE effacée disparaîtrait sur le
      // fond sombre, et l'isolement ne se lirait pas (mesuré au rendu).
      if (!matches(name)) out = { ...out, alpha: Math.min(out.alpha, GHOST), emit: undefined, col: GHOST_COL }
      else out = { ...out, alpha: Math.max(out.alpha, 1) }
    }
    const mv = shift.get(f.part)
    if (mv && (mv[0] || mv[1] || mv[2])) out = { ...out, pts: out.pts.map((p): Vec3 => [p[0] + mv[0], p[1] + mv[1], p[2] + mv[2]]) }
    return out
  })
}

/** Les noms de pièces d'une machine, tels qu'un auteur peut les demander à `isolate`. */
export function partNames(m: MachineDef): string[] {
  const seen = new Set<string>()
  for (const p of m.parts) if (p?.name) seen.add(p.name)
  return [...seen]
}
