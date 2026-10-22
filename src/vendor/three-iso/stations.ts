// GENERATED from website@8efd848719228d64dd983232c67cfca66c3db191:src/three/iso/stations.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Fabrique de MACHINES À POSTES : une disposition (`layouts.ts`), une voie tracée le long de ses tracés, une navette
 * qui sert les postes dans l'ordre, et sur chaque poste un socle cerclé de sa couleur portant une MÉCANIQUE
 * (`mechanisms.ts`). Une page décrit seulement ses postes (mécanique, couleur, clé i18n du groupe) et choisit sa
 * disposition ; le reste (taille des postes selon l'espacement, cadrage, variante étirée, variante pour écran très
 * large, apparition en construction par des essaims d'agents) vient d'ici et du rendu.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { annulus, ease, Frame, LAMP, MAT, Rz, span, type Face, type Vec3 } from './iso.ts'
import { LodScene, Registry, type MachineDef } from './machine.ts'
import { fromView } from './compose.ts'
import { makeLayout, type Layout, type LayoutKind, type Track } from './layouts.ts'
import { MECHANISMS, type MechCtx, type MechId, type Mechanism } from './mechanisms.ts'
import { planBuild, type BuildSpec } from './choreography.ts'

const U = 13
const ORIGIN = [600, 372] as const
const CAM = { U, origin: ORIGIN }
/** Dessus de la voie. */
const Z_TOP = 0.55
/** Hauteur d'un socle (unités locales du poste). */
const PAD_H = 0.62
/** Taille maximale d'un poste (les mécaniques sont décrites en unités « confortables » puis agrandies). */
const POST_SCALE = 3.0
/** Demi-largeur de la voie (unités monde). */
const TRACK_W = 1.7
const TAU = Math.PI * 2

export interface StationDef {
  /** Une mécanique de la bibliothèque, ou une mécanique compilée depuis un arbre (`ast.ts`). */
  mech: MechId | Mechanism
  /** Couleur d'accent (LAMP.*). */
  col: string
  /** Clé i18n du groupe (domaine `hero`), montrée au survol. */
  key: string
}

export interface StationMachineDef {
  /** Identifiant de base ; une variante de disposition s'appelle `<id>@<disposition>`. */
  id: string
  stations: readonly StationDef[]
  /** Disposition par défaut (celle qui s'appelle `id`). */
  layout: LayoutKind
  /** Anneau : angles d'écran imposés (un par poste). */
  degs?: readonly number[] | undefined
  /** Poste servi au pas 0 (instant canonique). */
  home?: number | undefined
  /** Durée d'un pas (s). */
  stepS?: number | undefined
  /** Dépendances de construction : `deps[i]` = postes que le poste i attend. */
  deps?: readonly (readonly number[])[] | undefined
  /** Enchaînement de la construction (mode, escouades, durée). */
  build?: BuildSpec | undefined
  /** Taille maximale des postes par disposition (défaut : 3 ; l'anneau et les ailes serrent le texte de plus près). */
  caps?: Partial<Record<LayoutKind, number>> | undefined
  /** Perspective : 0 = isométrique (défaut) ; > 0 = force du raccourcissement en profondeur. */
  focal?: number | undefined
}

export interface StationState {
  /** 0 → 1 : trajet de la navette du poste précédent au poste servi (premier tiers du pas). */
  move: number
  /** Poste servi pendant ce pas. */
  served: number
  /** 0 → 1 : le poste servi est soulevé (la navette est arrivée). */
  grip: number
  /** 0 → 1 : le cercle du poste servi s'allume. */
  lit: number
  /** 0 → 1 : geste de la mécanique servie. */
  g: number
  /** Temps continu (fraction de cycle). */
  u: number
  /** Pas courant et fraction dans le pas. */
  k: number
  f: number
}

/** État du cycle à l'instant u pour `n` postes, le pas 0 servant `home`. */
export function stationStateAt(u: number, n: number, home: number): StationState {
  const w = ((u % 1) + 1) % 1
  const k = Math.min(n - 1, Math.floor(w * n))
  const f = w * n - k
  const up = ease(span(f, 0.38, 0.5))
  const down = ease(span(f, 0.85, 0.95))
  return { move: ease(span(f, 0, 0.35)), served: (home + k) % n, grip: up * (1 - down), lit: span(f, 0.5, 0.56), g: ease(span(f, 0.5, 0.85)), u: w, k, f }
}

/** Respiration lente : 0 → 1 → 0, `n` fois par cycle, déphasée de `ph`. */
const breathe = (u: number, n: number, ph = 0) => 0.5 - 0.5 * Math.cos(u * TAU * n + ph)
/** Repère d'objet : le « devant » local (−y) regarde le lecteur, x va vers la GAUCHE de l'écran, z vers le haut. */
const FACE = Rz((3 * Math.PI) / 4)

interface TrackParts {
  deck: number[]
  rails: number[]
  line: number[]
}

/** Une voie au sol : polyligne de points monde, fermée ou non. */
interface GroundTrack {
  pts: Vec3[]
  closed: boolean
  /** Abscisses cumulées normalisées (0..1) des points. */
  L: number[]
}

function groundTrack(tr: Track): GroundTrack {
  const pts = tr.pts.map((q) => fromView(CAM, q[0], q[1], 0))
  const p = tr.closed ? [...pts, pts[0]!] : pts
  const L = [0]
  for (let i = 1; i < p.length; i++) L.push(L[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]))
  const tot = L[L.length - 1]!
  return { pts, closed: tr.closed, L: L.map((v) => v / tot) }
}

/** Point et direction (au sol) d'une voie à l'abscisse t. */
function along(g: GroundTrack, t: number): { p: Vec3; a: number } {
  const p = g.closed ? [...g.pts, g.pts[0]!] : g.pts
  const u = g.closed ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t))
  let i = 1
  while (i < g.L.length - 1 && g.L[i]! < u) i++
  const A = p[i - 1]!
  const B = p[i]!
  const f = (u - g.L[i - 1]!) / (g.L[i]! - g.L[i - 1]! || 1)
  return { p: [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, 0], a: Math.atan2(B[1] - A[1], B[0] - A[0]) }
}

/** Une face orientée vers `n` (retournée si besoin). */
/** Une face orientée vers `n` (retournée si besoin). Ses arêtes 1 et 3 (les joints entre deux segments de voie) sont
 * douces : la voie se lit continue, sans liseré à chaque segment ; `nrm` donne des normales par sommet (flancs courbes). */
function faceToward(s: LodScene, pts: Vec3[], n: Vec3, o: { part: number; col: string; emit?: string; alpha?: number }, nrm?: Vec3[]): void {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    nx += (a[1] - b[1]) * (a[2] + b[2])
    ny += (a[2] - b[2]) * (a[0] + b[0])
    nz += (a[0] - b[0]) * (a[1] + b[1])
  }
  const flip = nx * n[0] + ny * n[1] + nz * n[2] < 0
  s.face(flip ? [...pts].reverse() : pts, o, nrm && (flip ? [...nrm].reverse() : nrm), 0b1010)
}

/** Voie : tablier satiné, deux bordures d'acier, liseré lumineux au centre. Segment par segment, joints en onglet. */
function buildTrack(s: LodScene, g: GroundTrack, k: number, TP: TrackParts, fine: boolean): void {
  const n = g.pts.length
  const step = fine ? 1 : 3
  const idx: number[] = []
  for (let i = 0; i < n; i += step) idx.push(i)
  if (!g.closed && idx[idx.length - 1] !== n - 1) idx.push(n - 1)
  const P = idx.map((i) => g.pts[i]!)
  const m = P.length
  // Normale au sol (vers la gauche du sens de parcours), moyennée aux sommets.
  const nrm = P.map((_, i) => {
    const prev = P[g.closed ? (i - 1 + m) % m : Math.max(0, i - 1)]!
    const next = P[g.closed ? (i + 1) % m : Math.min(m - 1, i + 1)]!
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l] as const
  })
  const off = (i: number, d: number, z: number): Vec3 => [P[i]![0] + nrm[i]![0] * d, P[i]![1] + nrm[i]![1] * d, z]
  const W = TRACK_W
  const R0 = 0.22 // largeur d'une bordure
  const segs = g.closed ? m : m - 1
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % m
    const up: Vec3 = [0, 0, 1]
    faceToward(s, [off(i, -W + R0, Z_TOP), off(j, -W + R0, Z_TOP), off(j, W - R0, Z_TOP), off(i, W - R0, Z_TOP)], up, { part: TP.deck[k]!, col: MAT.satin })
    for (const side of [-1, 1]) {
      const out: Vec3 = [nrm[i]![0] * side, nrm[i]![1] * side, 0]
      const oj: Vec3 = [nrm[j]![0] * side, nrm[j]![1] * side, 0]
      const ins = (v: Vec3): Vec3 => [-v[0], -v[1], 0]
      const e = side * W
      const r = side * (W - R0)
      // Bordure : dessus, flanc extérieur (jusqu'au sol), flanc intérieur (au-dessus du tablier).
      faceToward(s, [off(i, r, Z_TOP + 0.1), off(j, r, Z_TOP + 0.1), off(j, e, Z_TOP + 0.1), off(i, e, Z_TOP + 0.1)], up, { part: TP.rails[k]!, col: MAT.steelL })
      faceToward(s, [off(i, e, 0), off(j, e, 0), off(j, e, Z_TOP + 0.1), off(i, e, Z_TOP + 0.1)], out, { part: TP.rails[k]!, col: MAT.steel }, [out, oj, oj, out])
      faceToward(s, [off(i, r, Z_TOP), off(j, r, Z_TOP), off(j, r, Z_TOP + 0.1), off(i, r, Z_TOP + 0.1)], ins(out), { part: TP.rails[k]!, col: MAT.steel }, [ins(out), ins(oj), ins(oj), ins(out)])
    }
    faceToward(s, [off(i, -0.06, Z_TOP + 0.01), off(j, -0.06, Z_TOP + 0.01), off(j, 0.06, Z_TOP + 0.01), off(i, 0.06, Z_TOP + 0.01)], [0, 0, 1], { part: TP.line[k]!, col: LAMP.indigo, emit: LAMP.indigo, alpha: 0.3 })
  }
  if (!g.closed) {
    // Embouts : la voie s'arrête net, fermée par un flanc d'acier.
    for (const [i, sgn] of [
      [0, -1],
      [m - 1, 1],
    ] as const) {
      const prev = P[sgn < 0 ? 1 : m - 2]!
      const t: Vec3 = [P[i]![0] - prev[0], P[i]![1] - prev[1], 0]
      faceToward(s, [off(i, -W, 0), off(i, W, 0), off(i, W, Z_TOP + 0.1), off(i, -W, Z_TOP + 0.1)], t, { part: TP.rails[k]!, col: MAT.steel })
    }
  }
}

export interface StationVariant {
  machine: MachineDef
  layout: Layout
}

interface Registered {
  R: Registry
  P: TrackParts & { shuttle: number; shuttleLamp: number }
  posts: { pad: number; ring: number; mini: Record<string, number | number[]> }[]
}

/** Registre partagé par toutes les variantes d'une même machine (mêmes pièces, quelle que soit la disposition). */
const registries = new WeakMap<StationMachineDef, Registered>()
/** Variante téléphone d'une machine (une par définition, partagée). */
const phones = new WeakMap<StationMachineDef, Map<number, MachineDef>>()
function phoneOf(def: StationMachineDef, gap = 1): MachineDef {
  const g = Math.round(Math.min(2.5, Math.max(1, gap)) * 10) / 10
  let byGap = phones.get(def)
  if (!byGap) {
    byGap = new Map()
    phones.set(def, byGap)
  }
  let m = byGap.get(g)
  if (!m) {
    m = makeStationMachine(def, 'phone', g).machine
    byGap.set(g, m)
  }
  return m
}
/** Variante compacte d'une machine (une par définition, partagée). */
const compacts = new WeakMap<StationMachineDef, MachineDef>()
function compactOf(def: StationMachineDef): MachineDef {
  let m = compacts.get(def)
  if (!m) {
    m = makeStationMachine(def, 'compact').machine
    compacts.set(def, m)
  }
  return m
}
const mechOf = (m: MechId | Mechanism): Mechanism => (typeof m === 'string' ? MECHANISMS[m] : m)
function register(def: StationMachineDef): Registered {
  const hit = registries.get(def)
  if (hit) return hit
  const R = new Registry()
  const G_TABLE = R.group('table')
  const G_TOOL = R.group('tool')
  const P = {
    deck: R.parts_('Voie', 4, G_TABLE, { under: true }),
    rails: R.parts_('Bordure d’acier', 4, G_TABLE, { under: true }),
    line: R.parts_('Liseré', 4, G_TABLE, { under: true, lod: 2 }),
    shuttle: R.part('Navette', G_TOOL, { under: true }),
    shuttleLamp: R.part('Feu de navette', G_TOOL, { under: true }),
  }
  const posts = def.stations.map((st, i) => {
    const g = R.group(st.key)
    const name = `${i + 1}. ${mechOf(st.mech).id}`
    const part = (n: string, o: { lod?: 1 | 2; layer?: number } = {}) => R.part(`${name} · ${n}`, g, o)
    const many = (n: string, k: number, o: { lod?: 1 | 2 } = {}) => R.parts_(`${name} · ${n}`, k, g, o)
    const pad = part('socle')
    const ring = part('cercle')
    return { pad, ring, mini: mechOf(st.mech).parts(part, many) }
  })
  const reg = { R, P, posts }
  registries.set(def, reg)
  return reg
}

/** Une machine à postes posée sur la disposition `kind` (défaut : celle de la définition), étirée de `sx`. */
export function makeStationMachine(def: StationMachineDef, kind: LayoutKind = def.layout, sx = 1, sy = 1): StationVariant {
  const { R, P, posts: reg } = register(def)
  const n = def.stations.length
  const home = def.home ?? 0
  const stepS = def.stepS ?? 1.5
  const layout = makeLayout(kind, n, kind === 'ring' ? def.degs : undefined, kind === 'phone' ? 1 : sx, kind === 'phone' ? sx : sy)
  const tracks = layout.tracks.map(groundTrack)
  const posts = layout.stops.map((st) => along(tracks[st.track]!, st.t).p)
  // Taille des postes : la plus grande qui laisse un jour entre deux socles voisins (au plus le plafond de la disposition).
  let dmin = posts.length > 1 ? Infinity : 99
  for (let a = 0; a < posts.length; a++)
    for (let b = a + 1; b < posts.length; b++) dmin = Math.min(dmin, Math.hypot(posts[a]![0] - posts[b]![0], posts[a]![1] - posts[b]![1]))
  const caps: Partial<Record<LayoutKind, number>> = { ring: 2.3, wings: 2.0, phone: 2.6, compact: 2.6, ...def.caps }
  const scale = Math.max(1.3, Math.min(caps[kind] ?? POST_SCALE, dmin / (2 * 1.95 * 1.06)))
  let fine = true
  const seg = (k: number) => (fine ? k : Math.max(6, Math.round(k / 3)))

  const shuttle = (s: LodScene, st: StationState) => {
    const to = layout.stops[st.served]!
    const from = layout.stops[(st.served + n - 1) % n]!
    const g = tracks[to.track]!
    // Même voie, vers l'avant : la navette glisse. Sinon (changement de voie, retour au début) : elle apparaît à l'arrivée.
    let t = to.t
    let alpha = 1
    if (from.track === to.track) {
      let d = to.t - from.t
      if (g.closed) d = ((d % 1) + 1) % 1
      if (d > 0) t = from.t + d * st.move
      else alpha = st.move
    } else alpha = st.move
    const { p, a } = along(g, t)
    const col = def.stations[st.served]!.col
    const F = new Frame(s, [p[0], p[1], Z_TOP + 0.1], Rz(a + Math.PI / 2))
    F.slab(-0.7, -0.4, 0, 1.4, 0.8, 0.26, 0.08, { part: P.shuttle, col: MAT.steelL, alpha })
    F.slab(-0.45, -0.25, 0.26, 0.9, 0.5, 0.06, 0.03, { part: P.shuttleLamp, col, emit: col, alpha })
  }

  const post = (s: LodScene, i: number, st: StationState, focus: number | null | undefined) => {
    const sd = def.stations[i]!
    const r = reg[i]!
    // Mis en avant par le lecteur : comme servi, soulevé, allumé, son geste joue en boucle.
    const focused = focus === i
    const served = st.served === i || focused
    const lit = focused ? 1 : served ? st.lit : 0
    const pos = posts[i]!
    const B = new Frame(s, [pos[0], pos[1], Z_TOP + 0.35 * (focused ? 1 : served ? st.grip : 0)], FACE, scale)
    B.coarse = !fine
    const col = sd.col
    const o: MechCtx['o'] = (part, c, x = {}) => ({ part, col: c, ...x })
    const glow: MechCtx['glow'] = (part, on, base = 0.25) => ({ part, col, emit: col, alpha: base + (1 - base) * on })
    // Socle satiné, cercle de couleur sur son biseau (vif quand le poste est servi).
    B.puck(0, 0, 0, 1.95, PAD_H, 0.16, o(r.pad, MAT.satin), seg(28))
    B.loft(annulus(1.62, 1.8, 0, TAU, seg(28)), annulus(1.62, 1.8, 0, TAU, seg(28)), 0.03, { ...glow(r.ring, Math.max(lit, 0.15 * breathe(st.u, 2, i))), at: [0, 0, PAD_H - 0.005] })
    mechOf(sd.mech).build({
      B,
      z: PAD_H,
      u: st.u,
      g: focused ? breathe(st.u, Math.max(2, n), 0) : served ? st.g : 0,
      lit,
      served,
      i,
      step: st.k,
      col,
      id: (k) => r.mini[k] as number,
      ids: (k) => r.mini[k] as number[],
      o,
      glow,
      seg,
      breathe,
      cyc: (k, ph = 0) => (((st.u * k + ph) % 1) + 1) % 1,
      L3: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    })
  }

  const machine: MachineDef = {
    id: (kind === def.layout ? def.id : `${def.id}@${kind}`) + (sx !== 1 || sy !== 1 ? `~${sx}x${sy}` : ''),
    U,
    origin: ORIGIN,
    focal: def.focal ?? 0,
    cycle: n * stepS,
    t0: 0.05,
    groups: R.groups,
    parts: R.parts,
    build(u: number, lod: 1 | 2, focus?: number | null): Face[] {
      const st = stationStateAt(u, n, home)
      fine = lod === 2
      const s = new LodScene(R.parts, lod)
      // Gros plan (`solo`) : la mécanique seule sur son socle, sans voie ni navette.
      if (kind !== 'solo') {
        tracks.forEach((g, k) => buildTrack(s, g, k, P, fine))
        shuttle(s, st)
      }
      for (let i = 0; i < n; i++) post(s, i, st, focus)
      return s.sorted()
    },
    // Gros plan : pas de texte à centrer, on cadre la mécanique elle-même.
    anchor: kind === 'solo' || kind === 'compact' ? undefined : layout.hole,
    // Points d'interaction : le centre de chaque poste, à mi-hauteur de son objet ; rayon = celui du socle.
    hotspots: { at: posts.map((q) => [q[0], q[1], Z_TOP + 1.4 * scale] as const), radius: 1.95 * scale },
    buildPlan: planBuild(n, def.deps ?? [], def.build),
    wide: kind === 'wings' || kind === 'corners' || kind === 'solo' || kind === 'phone' || kind === 'arch' ? undefined : () => makeStationMachine(def, 'wings').machine,
    phone: kind === 'solo' || kind === 'phone' || kind === 'compact' ? undefined : (gap?: number) => phoneOf(def, gap),
    compact: kind === 'solo' || kind === 'compact' ? undefined : () => compactOf(def),
    stretch: (k: number, ky = 1) => (k === 1 && ky === 1 ? machine : makeStationMachine(def, kind, k, ky).machine),
  }
  return { machine, layout }
}
