// GENERATED from website@185eab267e4d5376df1cabbb8309fe7e53a4206b:src/three/iso/buildIn.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Apparition « en construction » d'une machine : PO la CONÇOIT puis la BÂTIT sous les yeux du lecteur, avec un
 * orchestrateur qui coordonne des escouades d'agents qui travaillent en parallèle.
 *
 *   1. CONCEPTION (0 → 30 %) : l'orchestrateur apparaît au-dessus de la scène ; la machine se dessine en FIL DE FER
 *      (le plan) : la voie en balayage, puis chaque poste couche par couche ; des particules d'information portent le
 *      plan de l'orchestrateur à chaque poste qu'il dessine ;
 *   2. CONSTRUCTION (26 → 92 %) : une équipe pose la voie sur son tracé, puis des escouades d'agents-ouvriers prennent
 *      les postes selon le CALENDRIER de la scène (choreography.ts : dépendances, parallèle / séquentiel / vagues) ;
 *      chaque ouvrier vole au-dessus de son chantier, balaie la couche en cours avec sa buse (comme une imprimante),
 *      des étincelles jaillissent au point de contact, et la matière remplit le plan pièce par pièce ; un lien
 *      d'ordres relie l'orchestrateur à chaque escouade, un compte rendu vert remonte quand un poste est fini ;
 *   3. la navette arrive, l'essaim rejoint l'orchestrateur et s'efface ; la machine démarre.
 *
 * Le geste ne dépend que de la machine (groupes, pièces, couches, hauteurs) : toute scène l'a sans rien écrire.
 * `p` va de 0 (rien) à 1 (machine complète, essaim parti).
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { fromView, toView } from './compose.ts'
import { annulus, ease, Frame, LAMP, MAT, Rx, Scene, withHiddenFaces, type Face, type Vec3 } from './iso.ts'
import type { MachineDef } from './machine.ts'
import { BUILD_DEFAULTS, planBuild, type BuildPlan } from './choreography.ts'

/** Durée de l'apparition par défaut (ms). */
export const BUILD_MS = BUILD_DEFAULTS.durationMs
/** Escouades qui construisent des postes en même temps, et agents par escouade (par défaut). */
export const AGENTS = BUILD_DEFAULTS.agents
export const SQUAD = BUILD_DEFAULTS.squad
/** Taille d'un agent (unités monde par unité de dessin). */
const WORKER = 1.6

/** Fenêtres de l'apparition (fractions). */
const DESIGN_TRACK = [0.03, 0.14] as const
const DESIGN_STATIONS = [0.1, 0.3] as const
const TRACK = [0.26, 0.4] as const
const TOOL = 0.92
const LEAVE = [0.93, 1.0] as const
/** Couleur du plan (fil de fer) et de la lumière d'impression. */
export const BLUEPRINT = '#7dd3fc'
const PRINT = [0xa5, 0xb4, 0xfc]

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export function tint(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return '#' + c.map((v, i) => Math.round(v + (PRINT[i]! - v) * k).toString(16).padStart(2, '0')).join('')
}

interface FacePlan {
  /** Le trait du plan apparaît. */
  wire: number
  /** La matière commence à pousser, pendant `dur`, depuis `base`. */
  start: number
  dur: number
  base: number
}

interface Site {
  /** Centre au sol, rayon de l'empreinte, bas et sommet du poste. */
  c: Vec3
  rad: number
  top: number
  bottom: number
  /** Escouade, début et durée de son chantier ; début du dessin de son plan. */
  agent: number
  start: number
  dur: number
  wire: number
}

interface Schedule {
  plan: BuildPlan
  faces: FacePlan[]
  sites: Site[]
  /** Faces de la voie dans l'ordre de pose (le front des ouvriers de la voie). */
  track: { start: number; c: Vec3 }[]
  /** L'orchestrateur : au-dessus de la scène, au centre, juste sous le bord haut du cadre. */
  hub: Vec3
}

function schedule(m: MachineDef, faces: readonly Face[]): Schedule {
  const partMin = new Map<number, number>()
  for (const f of faces) {
    let z = Infinity
    for (const p of f.pts) z = Math.min(z, p[2])
    partMin.set(f.part, Math.min(partMin.get(f.part) ?? Infinity, z))
  }
  // Postes = groupes hors décor, dans l'ordre de déclaration (= l'ordre de service).
  const groups: number[] = []
  const acc = new Map<number, { x0: number; x1: number; y0: number; y1: number; lo: number; hi: number }>()
  for (const f of faces) {
    const g = m.parts[f.part]!.group
    const key = m.groups[g]!.key
    if (key === 'table' || key === 'tool') continue
    if (!groups.includes(g)) groups.push(g)
    const a = acc.get(g) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, lo: Infinity, hi: -Infinity }
    for (const p of f.pts) {
      a.x0 = Math.min(a.x0, p[0])
      a.x1 = Math.max(a.x1, p[0])
      a.y0 = Math.min(a.y0, p[1])
      a.y1 = Math.max(a.y1, p[1])
      a.lo = Math.min(a.lo, p[2])
      a.hi = Math.max(a.hi, p[2])
    }
    acc.set(g, a)
  }
  groups.sort((a, b) => a - b)
  const plan = m.buildPlan ?? planBuild(groups.length, [], {})
  const n = groups.length
  const sites: Site[] = groups.map((g, i) => {
    const a = acc.get(g)!
    const b = plan.stations[i] ?? { start: 0.4, dur: 0.15, agent: i % plan.agents }
    const wire = DESIGN_STATIONS[0] + ((DESIGN_STATIONS[1] - DESIGN_STATIONS[0] - 0.05) * i) / Math.max(1, n - 1)
    return { c: [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, 0], rad: Math.max(a.x1 - a.x0, a.y1 - a.y0) / 2, top: a.hi, bottom: a.lo, agent: b.agent, start: b.start, dur: b.dur, wire }
  })
  const siteOf = new Map(groups.map((g, i) => [g, i]))
  const [ax, ay] = m.anchor ?? [600, 350]
  const track: { start: number; c: Vec3 }[] = []
  const plans = faces.map((f): FacePlan => {
    const g = m.parts[f.part]!.group
    const key = m.groups[g]!.key
    if (key === 'table') {
      let cx = 0
      let cy = 0
      let wx = 0
      let wy = 0
      let wz = 0
      for (const p of f.pts) {
        const v = toView(m, p)
        cx += v[0]
        cy += v[1]
        wx += p[0]
        wy += p[1]
        wz += p[2]
      }
      const k = f.pts.length
      const sweep = ((((Math.atan2(cy / k - ay, cx / k - ax) + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)
      const start = TRACK[0] + (TRACK[1] - TRACK[0] - 0.05) * sweep
      track.push({ start, c: [wx / k, wy / k, wz / k] })
      return { wire: DESIGN_TRACK[0] + (DESIGN_TRACK[1] - DESIGN_TRACK[0]) * sweep, start, dur: 0.05, base: 0 }
    }
    const base = partMin.get(f.part)!
    if (key === 'tool') return { wire: DESIGN_STATIONS[1], start: TOOL, dur: 0.05, base }
    const s = sites[siteOf.get(g)!]!
    const piece = Math.min(0.07, s.dur * 0.4)
    // Ordre dans le poste : la couche déclarée (arbre : le contenant avant le contenu), puis la hauteur.
    const zf = (base - s.bottom) / (s.top - s.bottom || 1)
    const layer = m.parts[f.part]!.layer
    const frac = layer === undefined ? zf : 0.65 * layer + 0.35 * zf
    return { wire: s.wire + 0.05 * frac, start: s.start + (s.dur - piece) * frac, dur: piece, base }
  })
  track.sort((a, b) => a.start - b.start)
  let top = Infinity
  for (const f of faces) for (const q of f.pts) top = Math.min(top, toView(m, q)[1])
  const hub = fromView(m, ax, top + 30, 7)
  return { plan, faces: plans, sites, track, hub }
}

const cache = new WeakMap<MachineDef, Schedule>()
const mixV = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * Un agent-ouvrier : un corps clair, une visière lumineuse, deux rotors qui tournent, un bras qui descend vers le point
 * de travail et une buse au bout ; au travail, un faisceau court et des étincelles qui jaillissent au point de contact.
 */
export function worker(s: Scene, at: Vec3, work: Vec3 | null, alpha: number, t: number, part: number): void {
  const F = new Frame(s, at, undefined, WORKER)
  const a = { alpha }
  F.sphere([0, 0, 0], 0.26, { part, col: MAT.porcelain, ...a }, 12, 7)
  F.slab(-0.14, -0.27, -0.02, 0.28, 0.06, 0.1, 0.02, { part: part - 1, col: LAMP.indigo, emit: LAMP.indigo, ...a })
  for (const side of [-1, 1]) {
    const ang = t * 90 * side
    const R = new Frame(
      s,
      [at[0] + side * 0.4 * WORKER, at[1] - side * 0.4 * WORKER, at[2] + 0.22 * WORKER],
      [
        [Math.cos(ang), -Math.sin(ang), 0],
        [Math.sin(ang), Math.cos(ang), 0],
        [0, 0, 1],
      ],
      WORKER,
    )
    R.loft(annulus(0.22, 0.27, 0, Math.PI * 2, 14), annulus(0.22, 0.27, 0, Math.PI * 2, 14), 0.03, { part: part - 2, col: MAT.steelL, ...a, at: [0, 0, 0] })
    R.slab(-0.24, -0.03, 0, 0.48, 0.06, 0.02, 0, { part: part - 3, col: MAT.graphite, ...a })
  }
  if (!work) return
  // Bras et buse : du ventre de l'ouvrier vers un point juste au-dessus du travail.
  const W = new Frame(s, [0, 0, 0])
  const nozzle: Vec3 = [work[0], work[1], work[2] + 0.55]
  W.tube([at[0], at[1], at[2] - 0.3 * WORKER], nozzle, 0.05, { part: part - 4, col: MAT.steelL, ...a }, 6)
  const sq = (r: number) => [[r, 0], [0, r], [-r, 0], [0, -r]].map((q) => [q[0]!, q[1]!] as const)
  W.loft(sq(0.12), sq(0.04), 0.25, { part: part - 5, col: MAT.graphite, ...a, at: nozzle, rot: Rx(Math.PI) })
  W.tube([nozzle[0], nozzle[1], nozzle[2] - 0.25], work, 0.035, { part: part - 6, col: LAMP.indigo, emit: '#c7d2fe', alpha: 0.8 * alpha }, 6)
  // Étincelles : cinq éclats qui jaillissent du point de contact et retombent, en boucle.
  for (let k = 0; k < 5; k++) {
    const f = (((t * 9 + k / 5) % 1) + 1) % 1
    const ang = k * 1.256 + Math.floor(t * 9 + k / 5) * 2.1
    const q: Vec3 = [work[0] + Math.cos(ang) * 0.55 * f, work[1] + Math.sin(ang) * 0.55 * f, work[2] + 0.5 * f - 0.6 * f * f]
    W.sphere(q, 0.06 * (1 - f) + 0.015, { part: part - 7 - k, col: LAMP.amber, emit: '#fde68a', alpha: alpha * (1 - f) }, 6, 4)
  }
}

/** L'orchestrateur : un noyau lumineux dans deux orbites qui tournent ; il pulse quand il répartit le travail. */
export function orchestrator(s: Scene, at: Vec3, p: number, alpha: number, busy: number): void {
  const F = new Frame(s, at, undefined, 3.4)
  F.sphere([0, 0, 0], 0.55, { part: -50, col: MAT.porcelain, alpha }, 16, 9)
  F.sphere([0, 0, 0], 0.3 + 0.06 * busy, { part: -51, col: LAMP.indigo, emit: LAMP.indigo, alpha }, 10, 6)
  for (let k = 0; k < 2; k++) {
    const a = p * (k ? -14 : 11)
    const tilt = k ? 0.9 : -0.6
    const r = new Frame(
      s,
      at,
      [
        [Math.cos(a), -Math.sin(a) * Math.cos(tilt), Math.sin(a) * Math.sin(tilt)],
        [Math.sin(a), Math.cos(a) * Math.cos(tilt), -Math.cos(a) * Math.sin(tilt)],
        [0, Math.sin(tilt), Math.cos(tilt)],
      ],
      3.4,
    )
    r.loft(annulus(0.85, 0.93, 0, Math.PI * 2, 24), annulus(0.85, 0.93, 0, Math.PI * 2, 24), 0.04, { part: -52 - k, col: k ? LAMP.violet : LAMP.indigo, emit: k ? LAMP.violet : LAMP.indigo, alpha: 0.85 * alpha })
  }
}

/** Des particules d'information qui vont de `a` vers `b` (le plan envoyé, un ordre, un compte rendu). */
export function link(s: Scene, a: Vec3, b: Vec3, p: number, alpha: number, part: number, col: string): void {
  const F = new Frame(s, [0, 0, 0])
  const lift = 2.5
  const at = (t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + lift * Math.sin(t * Math.PI)]
  for (let k = 0; k < 4; k++) {
    const t = (((p * 5 + k / 4) % 1) + 1) % 1
    F.sphere(at(t), 0.16 + 0.08 * Math.sin(t * Math.PI), { part: part - k, col, emit: col, alpha: alpha * Math.sin(t * Math.PI) }, 8, 5)
  }
}

/** Point de travail de l'ouvrier `m` sur le poste `s` à l'avancée `t` du chantier : il balaie la couche en cours. */
function workPoint(s: Site, t: number, m: number): Vec3 {
  const h = s.bottom + (s.top - s.bottom) * clamp01(t)
  const a1 = Math.PI * 2 * (t * 2 + m / 3)
  const a2 = Math.PI * 2 * (t * 1.4 + m * 0.37)
  return [s.c[0] + s.rad * 0.7 * Math.sin(a1), s.c[1] + s.rad * 0.7 * Math.cos(a2), h]
}

/**
 * Faces de la machine à l'avancement `p` de son apparition, plan, ouvriers et orchestrateur compris. `faces` est
 * l'image figée (t0) dans l'ordre de `build` : le calendrier est calculé une fois et réutilisé à chaque image.
 */
export function assemble(m: MachineDef, faces: readonly Face[], p: number): Face[] {
  if (p >= 1) return faces as Face[]
  let sc = cache.get(m)
  if (!sc || sc.faces.length !== faces.length) {
    sc = schedule(m, faces)
    cache.set(m, sc)
  }
  const out: Face[] = []
  faces.forEach((f, k) => {
    const s = sc.faces[k]!
    if (p < s.wire) return
    const e = ease(clamp01((p - s.start) / s.dur))
    // Le plan : un trait qui apparaît, puis s'efface à mesure que la matière remplit la pièce.
    const wire = clamp01((p - s.wire) / 0.03) * (1 - e) * 0.85
    if (wire > 0.02) out.push({ ...f, col: BLUEPRINT, emit: undefined, wire })
    if (e <= 0.001) return
    if (e >= 0.999) {
      out.push(f)
      return
    }
    const pts = f.pts.map((q): Vec3 => [q[0], q[1], s.base + (q[2] - s.base) * e])
    const glow = 1 - e
    const g: Face = { ...f, pts }
    if (glow > 0.35) g.emit = tint(f.emit ?? f.col, 0.55 + 0.4 * glow)
    else if (!f.emit) g.col = tint(f.col, glow * 0.8)
    out.push(g)
  })

  const swarm = withHiddenFaces(() => {
    const S = new Scene()
    // Un seul poste (gros plan d'un bloc) : rien à coordonner, pas d'orchestrateur ; les ouvriers viennent d'au-dessus.
    const solo = sc.sites.length <= 1
    const hub: Vec3 = solo ? [sc.hub[0], sc.hub[1], sc.hub[2] + 6] : sc.hub
    const leave = ease(clamp01((p - LEAVE[0]) / (LEAVE[1] - LEAVE[0])))
    const show = solo ? 0 : clamp01(p / 0.04) * (1 - leave)
    const busy: { a: number; at: Vec3; alpha: number }[] = []
    // Conception : le plan part de l'orchestrateur vers chaque poste qu'il dessine.
    for (const [i, st] of sc.sites.entries()) {
      const t = (p - st.wire) / 0.07
      if (t > 0 && t < 1) link(S, hub, [st.c[0], st.c[1], st.top + 0.5], p + i * 0.17, show * Math.sin(t * Math.PI), -5000 - i * 10, BLUEPRINT)
    }
    // Pose de la voie : trois ouvriers suivent le front.
    for (let a = 0; a < (sc.track.length ? 3 : 0); a++) {
      const q = p - a * 0.012
      if (q < TRACK[0] || q > TRACK[1] + 0.03) continue
      let c = sc.track[0]!.c
      for (const tr of sc.track) if (tr.start <= q) c = tr.c
      const fade = clamp01((TRACK[1] + 0.03 - q) / 0.04) * clamp01((q - TRACK[0]) / 0.02)
      const work: Vec3 = [c[0] + (a - 1) * 0.8, c[1] - (a - 1) * 0.8, c[2] + 0.1]
      worker(S, [work[0] + 0.6, work[1] + 0.6, work[2] + 2.6], work, fade, p * 7 + a, -1000 - a * 20)
    }
    // Escouades des postes.
    for (let a = 0; a < sc.plan.agents; a++) {
      const mine = sc.sites.filter((s) => s.agent === a)
      if (!mine.length) continue
      const first = mine[0]!
      const last = mine[mine.length - 1]!
      for (let mi = 0; mi < sc.plan.squad; mi++) {
        const hover = (s: Site, t: number): Vec3 => {
          const w = workPoint(s, t, mi)
          return [w[0] + 0.5 + 0.4 * mi, w[1] + 0.5 - 0.3 * mi, s.top + 2.2 + 0.4 * mi]
        }
        const tIn = (s: Site) => clamp01((p - s.start) / s.dur)
        let at: Vec3
        let work: Vec3 | null = null
        let alpha = 1
        if (p < first.start) {
          // Arrivée depuis l'orchestrateur, l'un après l'autre.
          const t = ease(clamp01((p - (first.start - 0.08 + mi * 0.012)) / 0.07))
          if (t <= 0) continue
          at = mixV(hub, hover(first, 0), t)
          alpha = t
        } else if (p >= last.start + last.dur) {
          // Retour vers l'orchestrateur quand tout est fini.
          const t = Math.max(leave, ease(clamp01((p - (last.start + last.dur) - mi * 0.01) / 0.1)))
          at = mixV(hover(last, 1), hub, t)
          alpha = 1 - leave
        } else {
          const cur = mine.find((s) => p >= s.start && p < s.start + s.dur)
          if (cur) {
            at = hover(cur, tIn(cur))
            work = workPoint(cur, tIn(cur), mi)
          } else {
            // En vol entre deux chantiers : un arc au-dessus de la scène.
            const prev = [...mine].reverse().find((s) => s.start + s.dur <= p)!
            const next = mine.find((s) => s.start > p)!
            const t = ease(clamp01((p - (prev.start + prev.dur)) / Math.max(0.001, next.start - prev.start - prev.dur)))
            const q = mixV(hover(prev, 1), hover(next, 0), t)
            at = [q[0], q[1], q[2] + 3 * Math.sin(t * Math.PI)]
          }
        }
        if (alpha > 0.02) worker(S, at, work, alpha, p * 7 + a + mi * 0.3, -2000 - (a * 8 + mi) * 20)
        if (mi === 0 && alpha > 0.02) busy.push({ a, at, alpha })
      }
    }
    // L'orchestrateur coordonne : des ordres vers chaque escouade, un compte rendu vert quand un poste est fini.
    if (show > 0.02) {
      orchestrator(S, hub, p, show, busy.length / sc.plan.agents)
      for (const l of busy) link(S, hub, l.at, p + l.a * 0.13, 0.9 * show * l.alpha, -3000 - l.a * 10, LAMP.indigo)
      for (const [i, st] of sc.sites.entries()) {
        const t = (p - (st.start + st.dur)) / 0.06
        if (t > 0 && t < 1) link(S, [st.c[0], st.c[1], st.top + 1], hub, t / 5, show * Math.sin(t * Math.PI), -4000 - i * 10, LAMP.green)
      }
    }
    return S.faces
  })
  for (const f of swarm) out.push(f)
  return out
}
