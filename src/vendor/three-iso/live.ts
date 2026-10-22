// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/live.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Scène VIVANTE : une machine qui se construit au rythme d'un travail réel, au lieu d'une apparition jouée une fois.
 *
 * On lui envoie des patchs : un poste s'ajoute, une dépendance se pose, un poste change de statut. Chaque poste suit
 * SON chantier, sans fenêtre d'apparition fixe :
 *
 *   planned   le plan en fil de fer (l'orchestrateur l'a dessiné, personne n'y travaille) ;
 *   building  une escouade vole au-dessus et la matière monte, sans jamais finir d'elle-même : un chantier long
 *             reste un chantier (la montée ralentit, elle n'atteint pas le sommet) ;
 *   done      la matière finit de monter, puis un compte rendu vert remonte à l'orchestrateur ;
 *   failed    ce qui était construit vire à l'alerte, le reste du plan reste en fil de fer.
 *
 * Un poste fini ne rejoue jamais son chantier. Quand un ajout change la disposition, les postes glissent de leur
 * ancienne place vers la nouvelle (et le rendu WebGL glisse son cadrage) : aucun saut.
 *
 * Toute entrée passe par les contrôles de `defineScene` (mécaniques, arbres, teintes, cycles, budgets de faces) : un
 * lot de patchs invalide est refusé EN ENTIER, avec ses raisons, et la scène reste telle quelle.
 *
 * Le temps est passé par l'appelant (`now`, en ms) : le rendu est une fonction pure de l'état et de l'instant.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { fromView, toView } from './compose.ts'
import { ease, LAMP, Scene, withHiddenFaces, type Face, type Vec3 } from './iso.ts'
import type { MachineDef } from './machine.ts'
import { makeStationMachine } from './stations.ts'
import { checkSceneMachine, checkSceneSpec, stationDefOf, STATION_RANGE, type SceneSpec, type SceneStation, type Tone } from './scene.ts'
import type { MechId } from './mechanisms.ts'
import type { IsoNode } from './ast.ts'
import { BLUEPRINT, clamp01, link, orchestrator, tint, worker } from './buildIn.ts'
import type { LayoutKind } from './layouts.ts'

export type LiveStatus = 'planned' | 'building' | 'done' | 'failed'

export type LivePatch =
  | { op: 'add'; id: string; mech?: MechId; ast?: IsoNode; tone?: Tone; label?: string; after?: readonly string[]; status?: LiveStatus }
  | { op: 'status'; id: string; status: LiveStatus }
  | { op: 'link'; id: string; after: string }
  | { op: 'label'; id: string; label: string }
  | { op: 'pulse'; id: string }

export interface LiveStation {
  id: string
  mech?: MechId
  ast?: IsoNode
  tone: Tone
  label: string
  after: string[]
  status: LiveStatus
  /** Instant (ms) du dernier changement de statut. */
  since: number
  /** Avancement atteint au moment du dernier changement (la montée repart de là). */
  from: number
  /** Instants (ms) des particules demandées (`pulse`). */
  pulses: number[]
}

export type LiveResult = { ok: true; version: number } | { ok: false; problems: string[] }

export interface LiveOptions {
  /** Identifiant kebab-case de la scène (les machines dérivées en portent des variantes). */
  id: string
  /** Disposition (défaut `compact` : rien à entourer, dès le premier poste). */
  layout?: LayoutKind
  /** Agents par escouade (1 à 4, défaut 3). */
  squad?: number
}

/** Une scène vivante. `machine` change d'identité à chaque changement de forme (ajout, dépendance). */
export interface LiveScene {
  readonly id: string
  readonly version: number
  readonly stations: readonly LiveStation[]
  /** La machine à dessiner, ou null tant qu'aucun poste n'existe. */
  readonly machine: MachineDef | null
  apply(patches: LivePatch | readonly LivePatch[], now: number): LiveResult
  /** Avertir à chaque changement (forme ou statut). Rend la fonction de désabonnement. */
  subscribe(fn: () => void): () => void
}

/** Montée d'un chantier en cours : approche du sommet sans l'atteindre (constante de temps, ms ; plafond). */
export const BUILDING_TAU = 9000
export const BUILDING_CAP = 0.88
/** Fin de chantier (ms), compte rendu vert (ms), glissement de disposition (ms), particule (ms). */
export const FINISH_MS = 900
export const REPORT_MS = 1400
export const MOVE_MS = 700
export const PULSE_MS = 1100
const FAILED = '#f87171'
/** Ouvriers en vol au plus, toutes escouades confondues (le coût d'une image est surtout celui des ouvriers) : répartis
 * entre les chantiers en cours, au moins un par chantier tant qu'il en reste. */
export const MAX_WORKERS = 12
const LIVE_MAX = STATION_RANGE.compact[1]

/** Avancement (0..1) du chantier d'un poste à l'instant `now`. */
export function progressAt(st: Pick<LiveStation, 'status' | 'since' | 'from'>, now: number): number {
  const dt = Math.max(0, now - st.since)
  switch (st.status) {
    case 'planned':
      return 0
    case 'building':
      return st.from + (BUILDING_CAP - st.from) * (1 - Math.exp(-dt / BUILDING_TAU)) * (st.from < BUILDING_CAP ? 1 : 0)
    case 'done':
      return st.from + (1 - st.from) * ease(clamp01(dt / FINISH_MS))
    case 'failed':
      return st.from
  }
}

/** Ce que le rendu sait d'une machine dérivée : poste de chaque pièce, hauteur de base de chaque pièce. */
interface Index {
  station: Int16Array
  bottom: number[]
  top: number[]
  centers: Vec3[]
  hub: Vec3
}

interface Move {
  /** Décalage monde de chaque poste au début du glissement, dans la machine courante. */
  offsets: Vec3[]
  at: number
}

export function liveScene(opts: LiveOptions): LiveScene {
  const squad = Math.max(1, Math.min(4, opts.squad ?? 3))
  let stations: LiveStation[] = []
  let machine: MachineDef | null = null
  let version = 0
  let move: Move | null = null
  const subs = new Set<() => void>()
  const notify = () => {
    for (const fn of subs) fn()
  }

  const specOf = (list: readonly LiveStation[]): SceneSpec => {
    const ids = new Map(list.map((s, i) => [s.id, i]))
    // Compact dès le premier poste : l'échelle ne saute pas quand le deuxième arrive (le gros plan `solo` cadre serré).
    const layout: LayoutKind = opts.layout ?? 'compact'
    return {
      id: `${opts.id}-v${version + 1}`,
      layout,
      stations: list.map(
        (s, i): SceneStation => ({
          ...(s.mech !== undefined ? { mech: s.mech } : {}),
          ...(s.ast !== undefined ? { ast: s.ast } : {}),
          tone: s.tone,
          label: `live.station.${i + 1}`,
          after: s.after.map((a) => ids.get(a) ?? -1),
        }),
      ),
    }
  }

  /** La machine dessinée : la machine à postes, sans variantes, dont le rendu lit l'état COURANT des postes (un
   * changement de statut ne change pas de machine). */
  const derive = (inner: MachineDef, idx: Index): MachineDef => ({
    ...inner,
    stretch: undefined,
    wide: undefined,
    phone: undefined,
    compact: undefined,
    live: { assemble: (faces: readonly Face[], now: number) => assembleLive(idx, faces, stations, now, move, squad) },
  })

  let index: Index | null = null

  const apply = (patches: LivePatch | readonly LivePatch[], now: number): LiveResult => {
    const list = (Array.isArray(patches) ? patches : [patches]) as readonly LivePatch[]
    const next = stations.map((s) => ({ ...s, after: [...s.after], pulses: s.pulses.filter((t) => now - t < PULSE_MS) }))
    const problems: string[] = []
    let shape = false
    const find = (id: string, k: number) => {
      const s = next.find((x) => x.id === id)
      if (!s) problems.push(`patch ${k + 1} : aucun poste « ${id} »`)
      return s
    }
    const STATUSES: readonly LiveStatus[] = ['planned', 'building', 'done', 'failed']
    list.forEach((p, k) => {
      if (!p || typeof p !== 'object' || typeof (p as { id?: unknown }).id !== 'string') {
        problems.push(`patch ${k + 1} : un objet avec « op » et « id » est attendu`)
        return
      }
      switch (p.op) {
        case 'add': {
          if (next.some((x) => x.id === p.id)) {
            problems.push(`patch ${k + 1} : le poste « ${p.id} » existe déjà`)
            return
          }
          if (p.status !== undefined && !STATUSES.includes(p.status)) problems.push(`patch ${k + 1} : statut « ${String(p.status)} » (${STATUSES.join(', ')})`)
          const tone = p.tone ?? (Object.keys(LAMP) as Tone[])[next.length % Object.keys(LAMP).length]!
          next.push({
            id: p.id,
            ...(p.mech !== undefined ? { mech: p.mech } : {}),
            ...(p.ast !== undefined ? { ast: p.ast } : {}),
            tone,
            label: (p.label ?? '').slice(0, 60),
            after: [...(p.after ?? [])],
            status: p.status ?? 'planned',
            since: now,
            from: 0,
            pulses: [],
          })
          shape = true
          return
        }
        case 'status': {
          const s = find(p.id, k)
          if (!s) return
          if (!STATUSES.includes(p.status)) {
            problems.push(`patch ${k + 1} : statut « ${String(p.status)} » (${STATUSES.join(', ')})`)
            return
          }
          if (s.status === p.status) return
          // Un poste fini ne se rejoue pas : « done » → « building » repart du sommet (il reste plein).
          s.from = progressAt(s, now)
          s.status = p.status
          s.since = now
          return
        }
        case 'link': {
          const s = find(p.id, k)
          if (!s) return
          if (!next.some((x) => x.id === p.after)) problems.push(`patch ${k + 1} : aucun poste « ${p.after} » à attendre`)
          else if (!s.after.includes(p.after)) {
            s.after.push(p.after)
            shape = true
          }
          return
        }
        case 'label': {
          const s = find(p.id, k)
          if (s) s.label = String(p.label ?? '').slice(0, 60)
          return
        }
        case 'pulse': {
          const s = find(p.id, k)
          if (s) s.pulses.push(now)
          return
        }
        default:
          problems.push(`patch ${k + 1} : opération « ${String((p as { op?: unknown }).op)} » (add, status, link, label, pulse)`)
      }
    })
    if (next.length > LIVE_MAX) problems.push(`${next.length} postes : au plus ${LIVE_MAX} dans une scène vivante (regrouper)`)
    for (const s of next) for (const a of s.after) if (!next.some((x) => x.id === a)) problems.push(`poste « ${s.id} » : attend « ${a} », inconnu`)
    if (problems.length) return { ok: false, problems }

    let built: { m: MachineDef; idx: Index } | null = null
    if (shape) {
      const spec = specOf(next)
      const bad = checkSceneSpec(spec)
      if (bad.length) return { ok: false, problems: bad.map((b) => b.replace(/live\.station\.(\d+)/g, (_, n) => next[Number(n) - 1]?.id ?? n)) }
      let inner: MachineDef
      try {
        inner = makeStationMachine(stationDefOf(spec), spec.layout).machine
      } catch (e) {
        return { ok: false, problems: [`la scène n'a pas pu être construite : ${e instanceof Error ? e.message : String(e)}`] }
      }
      const over = checkSceneMachine(inner, spec.layout)
      if (over.length) return { ok: false, problems: over }
      const idx = indexOf(inner)
      // Glissement : chaque poste existant part de sa place (à l'écran) dans l'ancienne machine.
      if (machine && index) {
        const old = machine
        const oldIdx = index
        move = {
          at: now,
          offsets: idx.centers.map((c, i): Vec3 => {
            const o = oldIdx.centers[i]
            if (!o) return [0, 0, 0]
            const v = toView(old, o)
            const w = fromView(inner, v[0], v[1], 0)
            return [w[0] - c[0], w[1] - c[1], 0]
          }),
        }
      }
      built = { m: derive(inner, idx), idx }
    }
    stations = next
    if (built) {
      machine = built.m
      index = built.idx
    }
    version++
    notify()
    return { ok: true, version }
  }

  return {
    id: opts.id,
    get version() {
      return version
    },
    get stations() {
      return stations
    },
    get machine() {
      return machine
    },
    apply,
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
  }
}

const indexCache = new WeakMap<MachineDef, Index>()
function indexOf(m: MachineDef): Index {
  const hit = indexCache.get(m)
  if (hit) return hit
  const faces = withHiddenFaces(() => m.build(m.t0, 2))
  // Postes = groupes hors décor, dans l'ordre de déclaration.
  const order: number[] = []
  m.groups.forEach((g, i) => {
    if (g.key !== 'table' && g.key !== 'tool') order.push(i)
  })
  const ofGroup = new Map(order.map((g, i) => [g, i]))
  const station = new Int16Array(m.parts.length).fill(-1)
  m.parts.forEach((p, i) => {
    station[i] = ofGroup.get(p.group) ?? -1
  })
  const bottom = order.map(() => Infinity)
  const top = order.map(() => -Infinity)
  const box = order.map(() => [Infinity, -Infinity, Infinity, -Infinity])
  let viewTop = Infinity
  for (const f of faces) {
    for (const q of f.pts) viewTop = Math.min(viewTop, toView(m, q)[1])
    const s = f.part >= 0 ? station[f.part]! : -1
    if (s < 0) continue
    for (const q of f.pts) {
      bottom[s] = Math.min(bottom[s]!, q[2])
      top[s] = Math.max(top[s]!, q[2])
      const b = box[s]!
      b[0] = Math.min(b[0]!, q[0])
      b[1] = Math.max(b[1]!, q[0])
      b[2] = Math.min(b[2]!, q[1])
      b[3] = Math.max(b[3]!, q[1])
    }
  }
  const centers = box.map((b): Vec3 => [(b[0]! + b[1]!) / 2, (b[2]! + b[3]!) / 2, 0])
  const [ax] = m.anchor ?? [600, 350]
  const hub = fromView(m, ax, viewTop + 30, 7)
  const idx = { station, bottom, top, centers, hub }
  indexCache.set(m, idx)
  return idx
}

/** Les faces de la machine selon l'état vivant de chaque poste, ouvriers et orchestrateur compris. */
export function assembleLive(
  idx: Index,
  faces: readonly Face[],
  stations: readonly LiveStation[],
  now: number,
  move: Move | null,
  squad = 3,
): Face[] {
  const prog = stations.map((s) => progressAt(s, now))
  const glide = move ? 1 - ease(clamp01((now - move.at) / MOVE_MS)) : 0
  const shift = (s: number): Vec3 | null => {
    if (!move || glide <= 0) return null
    const o = move.offsets[s]
    return o && (o[0] || o[1]) ? [o[0] * glide, o[1] * glide, 0] : null
  }
  const out: Face[] = []
  for (const f of faces) {
    const s = f.part >= 0 ? idx.station[f.part]! : -1
    if (s < 0 || s >= stations.length) {
      out.push(f)
      continue
    }
    const st = stations[s]!
    const d = shift(s)
    const pts = d ? f.pts.map((q): Vec3 => [q[0] + d[0], q[1] + d[1], q[2]]) : f.pts
    const lo = idx.bottom[s]!
    const hi = idx.top[s]!
    let base = Infinity
    for (const q of f.pts) base = Math.min(base, q[2])
    const frac = (base - lo) / (hi - lo || 1)
    const p = prog[s]!
    // Chaque pièce pousse quand le front du chantier passe sa hauteur (fenêtre de 18 % de la hauteur du poste).
    const e = st.status === 'planned' ? 0 : ease(clamp01((p - frac * 0.82) / 0.18))
    const appear = clamp01((now - st.since) / 400)
    const wire = (st.status === 'planned' ? appear : 1) * (1 - e) * 0.85
    if (wire > 0.02) out.push({ ...f, pts, col: st.status === 'failed' ? FAILED : BLUEPRINT, emit: undefined, wire })
    if (e <= 0.001) continue
    const g: Face = { ...f, pts: e >= 0.999 ? pts : pts.map((q): Vec3 => [q[0], q[1], base + (q[2] - base) * e]) }
    if (st.status === 'failed') {
      g.col = FAILED
      g.emit = undefined
    } else if (e < 0.999) {
      // Un chantier vivant peut durer : la lueur d'impression reste discrète (pas de tache blanche qui dure).
      const glow = 1 - e
      if (glow > 0.6) g.emit = tint(f.emit ?? f.col, 0.3 + 0.3 * glow)
      else if (!f.emit) g.col = tint(f.col, glow * 0.5)
    }
    out.push(g)
  }

  const swarm = withHiddenFaces(() => {
    const S = new Scene()
    const many = stations.length > 1
    const hub = many ? idx.hub : ([idx.hub[0], idx.hub[1], idx.hub[2] + 6] as Vec3)
    const centre = (s: number): Vec3 => {
      const c = idx.centers[s]!
      const d = shift(s)
      return d ? [c[0] + d[0], c[1] + d[1], 0] : c
    }
    let busy = 0
    const building = stations.filter((st) => st.status === 'building').length
    const each = building ? Math.max(1, Math.min(squad, Math.floor(MAX_WORKERS / building))) : 0
    let left = MAX_WORKERS
    stations.forEach((st, s) => {
      const c = centre(s)
      const lo = idx.bottom[s]!
      const hi = idx.top[s]!
      const rad = 1.4
      const p = prog[s]!
      const dt = now - st.since
      if (st.status === 'planned' && many) {
        // Le plan part de l'orchestrateur vers le poste qu'il vient de dessiner.
        const t = dt / 900
        if (t > 0 && t < 1) link(S, hub, [c[0], c[1], hi + 0.5], t, Math.sin(t * Math.PI), -5000 - s * 10, BLUEPRINT)
      }
      if (st.status === 'building') {
        busy++
        const arrive = ease(clamp01(dt / 800))
        const crew = Math.min(each, left)
        left -= crew
        for (let k = 0; k < crew; k++) {
          const tt = now / 1000
          const a1 = Math.PI * 2 * (tt * 0.35 + k / squad)
          const h = lo + (hi - lo) * Math.min(1, p + 0.05)
          const work: Vec3 = [c[0] + rad * 0.7 * Math.sin(a1), c[1] + rad * 0.7 * Math.cos(a1 * 0.8), h]
          const over: Vec3 = [work[0] + 0.5 + 0.4 * k, work[1] + 0.5 - 0.3 * k, hi + 2.2 + 0.4 * k]
          const at: Vec3 = arrive < 1 ? [hub[0] + (over[0] - hub[0]) * arrive, hub[1] + (over[1] - hub[1]) * arrive, hub[2] + (over[2] - hub[2]) * arrive] : over
          worker(S, at, arrive >= 1 ? work : null, Math.max(0.05, arrive), tt * 1.2 + s + k * 0.3, -2000 - (s * 8 + k) * 20)
          if (k === 0 && many) link(S, hub, at, tt / 4 + s * 0.13, 0.8 * arrive, -3000 - s * 10, LAMP.indigo)
        }
      }
      if (st.status === 'done' && many) {
        const t = (dt - FINISH_MS * 0.6) / REPORT_MS
        if (t > 0 && t < 1) link(S, [c[0], c[1], hi + 1], hub, t / 4, Math.sin(t * Math.PI), -4000 - s * 10, LAMP.green)
      }
      for (const [k, t0] of st.pulses.entries()) {
        const t = (now - t0) / PULSE_MS
        if (t > 0 && t < 1 && many) link(S, [c[0], c[1], hi + 1], hub, t / 4, Math.sin(t * Math.PI), -6000 - s * 40 - k * 5, LAMP.amber)
      }
    })
    if (many) orchestrator(S, hub, now / 9000, 1, busy / Math.max(1, stations.length))
    return S.faces
  })
  for (const f of swarm) out.push(f)
  return out
}
