// GENERATED from website@185eab267e4d5376df1cabbb8309fe7e53a4206b:src/three/iso/ast.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * PROTOCOLE DE CONSTRUCTION : des objets et des mécaniques décrits comme des DONNÉES (un arbre JSON), compilés en
 * mécaniques que n'importe quelle scène pose sur ses postes. Jamais de code : un arbre se valide, se sérialise, se
 * transmet (une page, un modèle dans le chat) et se compose.
 *
 * Un nœud est une forme (`slab` dalle, `puck` palet, `sphere`, `tube`, `ring` anneau, `cone`), un `group` (des
 * enfants dans un repère commun, avec des POINTS D'ACCROCHE nommés), ou un `use` (un objet tout fait du catalogue,
 * accroché si besoin à un point d'accroche d'un groupe parent : c'est ainsi que les objets s'EMBOÎTENT).
 *
 * Ce que le compilateur DÉDUIT seul, sans déclaration :
 *   - les PIÈCES : chaque forme est une pièce, nommée par son chemin dans l'arbre (`base/étage.2/écran`) ;
 *   - le NIVEAU DE DÉTAIL : une pièce plus petite que DETAIL n'existe qu'au rendu éclairé (pas au SVG de repli) ;
 *   - les COUCHES de construction : d'abord la profondeur dans l'arbre (le contenant avant le contenu), puis la hauteur.
 *
 * Repère d'un poste : −y vers le lecteur, x vers la GAUCHE de l'écran, z vers le haut ; dessus du socle en z = 0 de
 * l'arbre ; empreinte utile ±1,4. Une forme est posée par la base de son centre (`at`), une sphère par son centre, un
 * tube va de `at` à `to`. `rot` en degrés (x, y, z, appliqués dans cet ordre). Teintes : une matière (`mat`) ou une
 * teinte de la palette (`tone`, `accent` = celle du poste) ; `glow` rend la forme lumineuse.
 *
 * Mouvements (`motion`) : `spin` (tourne autour d'un axe), `bob` (monte et descend), `slide` (glisse le long d'un axe),
 * `pulse` (la lumière respire), `orbit` (tourne autour de l'axe z du parent), `path` (parcourt une suite de points).
 * `when: 'idle'` (défaut) = au repos, en boucle, `period` fois par cycle (entier : le cycle reste exact) ;
 * `when: 'gesture'` = pendant le geste du poste servi (de 0 à 1).
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { ease, LAMP, MAT, mmul, ngon, Rx, Ry, Rz, I3, annulus, type Frame, type Mat3, type Vec3 } from './iso.ts'
import type { MechCtx, Mechanism } from './mechanisms.ts'

export type V3 = readonly [number, number, number]
export type Material = 'porcelain' | 'satin' | 'graphite' | 'steel' | 'steelL' | 'brass' | 'brassL' | 'copper' | 'dark'
export type ToneName = keyof typeof LAMP | 'accent'

export interface Motion {
  kind: 'spin' | 'bob' | 'slide' | 'pulse' | 'orbit' | 'path'
  /** Axe de `spin` et `slide` (défaut z pour spin, x pour slide). */
  axis?: 'x' | 'y' | 'z'
  /** Amplitude : degrés (spin au geste, orbit au geste), unités (bob, slide). Défaut selon le mouvement. */
  amount?: number
  /** Répétitions par cycle au repos (entier, défaut 1). */
  period?: number
  /** Décalage (fraction de cycle). */
  phase?: number
  /** `idle` (défaut) ou `gesture`. */
  when?: 'idle' | 'gesture'
  /** `path` : points parcourus (repère du parent). */
  points?: readonly V3[]
}

interface Base {
  /** Nom de la pièce (sinon le type et son rang). */
  name?: string
  at?: V3
  rot?: V3
  mat?: Material
  tone?: ToneName
  glow?: boolean
  motion?: Motion | readonly Motion[]
  /** Forcer la pièce au rendu éclairé seulement. */
  detail?: boolean
}

export type IsoNode =
  | (Base & { kind: 'slab'; size: V3; bevel?: number })
  | (Base & { kind: 'puck'; r: number; h: number; bevel?: number })
  | (Base & { kind: 'sphere'; r: number })
  | (Base & { kind: 'tube'; to: V3; r: number })
  | (Base & { kind: 'ring'; r: number; w?: number; h?: number })
  | (Base & { kind: 'cone'; r: number; h: number; top?: number })
  | (Base & { kind: 'group'; children: readonly IsoNode[]; sockets?: Readonly<Record<string, V3>> })
  | (Base & { kind: 'use'; ref: string; attach?: string; scale?: number })

/** Une pièce plus petite que ceci (en unités du poste) n'existe qu'au rendu éclairé. */
export const DETAIL = 0.16
/** Bornes : profondeur de l'arbre, nombre de formes, tailles. */
export const AST_LIMITS = { depth: 8, shapes: 160, size: [0.01, 6] as const, path: 12 }

const MATS: Readonly<Record<Material, string>> = {
  porcelain: MAT.porcelain,
  satin: MAT.satin,
  graphite: MAT.graphite,
  steel: MAT.steel,
  steelL: MAT.steelL,
  brass: MAT.brass,
  brassL: MAT.brassL,
  copper: MAT.copper,
  dark: MAT.dark,
}
const KINDS = new Set(['slab', 'puck', 'sphere', 'tube', 'ring', 'cone', 'group', 'use'])
const MOTIONS = new Set(['spin', 'bob', 'slide', 'pulse', 'orbit', 'path'])
const TAU = Math.PI * 2
const deg = (v: number) => (v * Math.PI) / 180

/** Catalogue d'objets tout faits (référencés par `use`). Rempli par `catalog.ts`. */
export const CATALOG = new Map<string, IsoNode>()

/* ---------- Validation ---------- */

/** Liste des corrections (vide = l'arbre est valide). */
export function checkAst(root: IsoNode): string[] {
  const out: string[] = []
  let shapes = 0
  const num = (where: string, k: string, v: unknown, lo: number = AST_LIMITS.size[0], hi: number = AST_LIMITS.size[1]) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) out.push(`${where} : ${k} = ${String(v)} (attendu de ${lo} à ${hi})`)
  }
  const vec = (where: string, k: string, v: unknown, lo = -20, hi = 20) => {
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi)) out.push(`${where} : ${k} doit être [x, y, z] dans [${lo}, ${hi}]`)
  }
  const walk = (n: IsoNode, path: string, depth: number, sockets: Set<string>) => {
    const where = path || 'racine'
    if (!n || typeof n !== 'object' || !KINDS.has((n as { kind: string }).kind)) {
      out.push(`${where} : type « ${(n as { kind?: string })?.kind} » inconnu (${[...KINDS].join(', ')})`)
      return
    }
    if (depth > AST_LIMITS.depth) {
      out.push(`${where} : arbre trop profond (au plus ${AST_LIMITS.depth} niveaux)`)
      return
    }
    if (n.at !== undefined) vec(where, 'at', n.at)
    if (n.rot !== undefined) vec(where, 'rot', n.rot, -360, 360)
    if (n.mat !== undefined && !(n.mat in MATS)) out.push(`${where} : matière « ${n.mat} » inconnue (${Object.keys(MATS).join(', ')})`)
    if (n.tone !== undefined && n.tone !== 'accent' && !(n.tone in LAMP)) out.push(`${where} : teinte « ${n.tone} » hors palette (accent, ${Object.keys(LAMP).join(', ')})`)
    if (n.name !== undefined && !/^[\p{L}\p{N} ._-]{1,40}$/u.test(n.name)) out.push(`${where} : nom « ${n.name} » invalide`)
    for (const mo of n.motion === undefined ? [] : Array.isArray(n.motion) ? n.motion : [n.motion as Motion]) {
      if (!MOTIONS.has(mo.kind)) out.push(`${where} : mouvement « ${mo.kind} » inconnu (${[...MOTIONS].join(', ')})`)
      if (mo.period !== undefined && (!Number.isInteger(mo.period) || mo.period < 1 || mo.period > 12)) out.push(`${where} : period ${mo.period} (entier de 1 à 12, pour que le cycle reste exact)`)
      if (mo.when !== undefined && mo.when !== 'idle' && mo.when !== 'gesture') out.push(`${where} : when « ${mo.when} » (idle ou gesture)`)
      if (mo.kind === 'path') {
        if (!Array.isArray(mo.points) || mo.points.length < 2 || mo.points.length > AST_LIMITS.path) out.push(`${where} : path demande de 2 à ${AST_LIMITS.path} points`)
        else (mo.points as readonly unknown[]).forEach((p, k) => vec(where, `points[${k}]`, p))
      }
    }
    switch (n.kind) {
      case 'slab':
        vec(where, 'size', n.size, AST_LIMITS.size[0], AST_LIMITS.size[1])
        shapes++
        break
      case 'puck':
        num(where, 'r', n.r)
        num(where, 'h', n.h)
        shapes++
        break
      case 'sphere':
        num(where, 'r', n.r)
        shapes++
        break
      case 'tube':
        vec(where, 'to', n.to)
        num(where, 'r', n.r)
        shapes++
        break
      case 'ring':
        num(where, 'r', n.r)
        shapes++
        break
      case 'cone':
        num(where, 'r', n.r)
        num(where, 'h', n.h)
        shapes++
        break
      case 'group': {
        if (!Array.isArray(n.children) || n.children.length === 0) out.push(`${where} : un groupe a au moins un enfant`)
        const s = new Set(sockets)
        for (const [k, v] of Object.entries(n.sockets ?? {})) {
          vec(where, `sockets.${k}`, v)
          s.add(k)
        }
        ;(n.children ?? []).forEach((c, i) => walk(c, `${path ? path + '/' : ''}${c?.name ?? `${c?.kind}.${i}`}`, depth + 1, s))
        break
      }
      case 'use': {
        const obj = CATALOG.get(n.ref)
        if (!obj) out.push(`${where} : objet « ${n.ref} » absent du catalogue (${[...CATALOG.keys()].join(', ')})`)
        if (n.attach !== undefined && !sockets.has(n.attach)) out.push(`${where} : point d'accroche « ${n.attach} » inconnu des groupes parents (${[...sockets].join(', ') || 'aucun'})`)
        if (n.scale !== undefined) num(where, 'scale', n.scale, 0.1, 4)
        if (obj) walk(obj, `${where}>${n.ref}`, depth + 1, new Set())
        break
      }
    }
  }
  walk(root, '', 0, new Set())
  if (shapes > AST_LIMITS.shapes) out.push(`${shapes} formes (au plus ${AST_LIMITS.shapes})`)
  return out
}

/* ---------- Compilation ---------- */

interface Leaf {
  path: string
  node: IsoNode
  /** Profondeur dans l'arbre (couches de construction). */
  depth: number
  /** Le plus petit encombrement de la forme (niveau de détail). */
  size: number
}

/** Formes de l'arbre (les `use` dépliés), avec leur chemin, leur profondeur et leur taille. */
function leaves(root: IsoNode): Leaf[] {
  const out: Leaf[] = []
  const walk = (n: IsoNode, path: string, depth: number, scale: number) => {
    if (n.kind === 'group') {
      n.children.forEach((c, i) => walk(c, `${path ? path + '/' : ''}${c.name ?? `${c.kind}.${i}`}`, depth + 1, scale))
      return
    }
    if (n.kind === 'use') {
      walk(CATALOG.get(n.ref)!, `${path}>${n.ref}`, depth + 1, scale * (n.scale ?? 1))
      return
    }
    const size =
      n.kind === 'slab'
        ? Math.max(n.size[0], n.size[1], n.size[2])
        : n.kind === 'tube'
          ? Math.max(n.r * 2, Math.hypot(n.to[0] - (n.at?.[0] ?? 0), n.to[1] - (n.at?.[1] ?? 0), n.to[2] - (n.at?.[2] ?? 0)))
          : n.kind === 'puck' || n.kind === 'cone'
            ? Math.max(n.r * 2, n.h)
            : n.r * 2
    out.push({ path: path || n.kind, node: n, depth, size: size * scale })
  }
  walk(root, root.name ?? '', 0, 1)
  return out
}

const rotOf = (r: V3 | undefined): Mat3 => (r ? mmul(mmul(Rz(deg(r[2])), Ry(deg(r[1]))), Rx(deg(r[0]))) : I3)

/** Valeur d'un mouvement à l'instant : au repos, une oscillation (−1..1) ; au geste, l'avancée (0..1). */
function motionValue(mo: Motion, c: MechCtx): { v: number; t: number } {
  if (mo.when === 'gesture') return { v: c.g, t: c.g }
  const t = (((c.u * (mo.period ?? 1) + (mo.phase ?? 0)) % 1) + 1) % 1
  return { v: Math.sin(t * TAU), t }
}

/** Applique les mouvements d'un nœud : position et rotation propres, et éclat lumineux. */
function applyMotion(n: IsoNode, c: MechCtx, at: Vec3, rot: Mat3): { at: Vec3; rot: Mat3; shine: number } {
  let shine = 1
  for (const mo of n.motion === undefined ? [] : Array.isArray(n.motion) ? n.motion : [n.motion as Motion]) {
    const { v, t } = motionValue(mo, c)
    const gest = mo.when === 'gesture'
    const ax = mo.axis
    switch (mo.kind) {
      case 'spin': {
        const a = gest ? deg(mo.amount ?? 360) * ease(v) : t * TAU
        rot = mmul(rot, ax === 'x' ? Rx(a) : ax === 'y' ? Ry(a) : Rz(a))
        break
      }
      case 'bob': {
        const d = (mo.amount ?? 0.12) * (gest ? Math.sin(v * Math.PI) : v)
        at = [at[0], at[1], at[2] + d]
        break
      }
      case 'slide': {
        const d = (mo.amount ?? 0.4) * (gest ? ease(v) : 0.5 + 0.5 * v)
        const k = ax === 'y' ? 1 : ax === 'z' ? 2 : 0
        at = at.map((x, i) => (i === k ? x + d : x)) as unknown as Vec3
        break
      }
      case 'pulse':
        shine = gest ? 0.3 + 0.7 * v : 0.55 + 0.45 * v
        break
      case 'orbit': {
        const a = gest ? deg(mo.amount ?? 360) * ease(v) : t * TAU
        const r = Math.hypot(at[0], at[1])
        const a0 = Math.atan2(at[1], at[0])
        at = [r * Math.cos(a0 + a), r * Math.sin(a0 + a), at[2]]
        break
      }
      case 'path': {
        const pts = mo.points!
        const s = (gest ? ease(v) : t) * (pts.length - 1)
        const k = Math.min(pts.length - 2, Math.floor(s))
        const f = s - k
        const a = pts[k]!
        const b = pts[k + 1]!
        at = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f + 0.25 * Math.sin(f * Math.PI)]
        break
      }
    }
  }
  return { at, rot, shine }
}

/** Dessine l'arbre dans le repère `F` (celui du poste, dessus du socle en z = `z0`). */
function drawTree(root: IsoNode, c: MechCtx, F: Frame, z0: number, sockets: Map<string, V3>): void {
  const walk = (n: IsoNode, path: string, frame: Frame, socks: Map<string, V3>) => {
    let at: Vec3 = n.at ? [n.at[0], n.at[1], n.at[2]] : [0, 0, 0]
    if (n.kind === 'use' && n.attach) {
      const s = socks.get(n.attach)!
      at = [at[0] + s[0], at[1] + s[1], at[2] + s[2]]
    }
    const m = applyMotion(n, c, at, rotOf(n.rot))
    const sub = frame.sub(m.at, m.rot)
    if (n.kind === 'group') {
      const s2 = new Map(socks)
      for (const [k, v] of Object.entries(n.sockets ?? {})) s2.set(k, v)
      n.children.forEach((ch, i) => walk(ch, `${path ? path + '/' : ''}${ch.name ?? `${ch.kind}.${i}`}`, sub, s2))
      return
    }
    if (n.kind === 'use') {
      const obj = CATALOG.get(n.ref)!
      const k = n.scale ?? 1
      const scaled = k === 1 ? sub : sub.scaled(k)
      walk(obj, `${path}>${n.ref}`, scaled, new Map())
      return
    }
    const part = c.id(path || n.kind)
    const col = n.tone === undefined ? MATS[n.mat ?? 'porcelain'] : n.tone === 'accent' ? c.col : LAMP[n.tone]
    const o = n.glow ? { part, col, emit: col, alpha: Math.min(1, Math.max(c.lit, 0.35) * m.shine + (1 - m.shine) * 0.1) } : { part, col }
    switch (n.kind) {
      case 'slab': {
        const [w, d, h] = n.size
        sub.slab(-w / 2, -d / 2, 0, w, d, h, n.bevel ?? Math.min(0.07, Math.min(w, d, h) / 4), o)
        break
      }
      case 'puck':
        sub.puck(0, 0, 0, n.r, n.h, n.bevel ?? Math.min(0.08, n.h / 3), o, c.seg(Math.max(10, Math.round(n.r * 18))))
        break
      case 'sphere':
        sub.sphere([0, 0, 0], n.r, o, c.seg(Math.max(8, Math.round(n.r * 36))), Math.max(4, c.seg(Math.max(6, Math.round(n.r * 20))) - 2))
        break
      case 'tube':
        // `to` est donné dans le repère du parent : relatif au départ du tube.
        sub.tube([0, 0, 0], [n.to[0] - at[0], n.to[1] - at[1], n.to[2] - at[2]], n.r, o, c.seg(8))
        break
      case 'ring': {
        const w = n.w ?? 0.08
        const s = c.seg(Math.max(16, Math.round(n.r * 24)))
        sub.loft(annulus(n.r - w, n.r, 0, TAU, s), annulus(n.r - w, n.r, 0, TAU, s), n.h ?? 0.04, { ...o, at: [0, 0, 0] })
        break
      }
      case 'cone': {
        const s = c.seg(Math.max(10, Math.round(n.r * 18)))
        sub.loft(ngon(n.r, s), ngon(Math.max(0.01, n.top ?? 0.01), s), n.h, { ...o, at: [0, 0, 0] })
        break
      }
    }
  }
  walk(root, root.name ?? '', F.sub([0, 0, z0], I3), sockets)
}

/**
 * Une mécanique compilée depuis un arbre (vérifié par `checkAst` : un arbre invalide lève une erreur qui liste les
 * corrections). Ses pièces, leur niveau de détail et leurs couches de construction sont déduits de l'arbre.
 */
export function astMechanism(id: string, root: IsoNode, shows = 'mécanique décrite par un arbre'): Mechanism & { layers: Map<string, number> } {
  const bad = checkAst(root)
  if (bad.length) throw new Error(`mécanique « ${id} » refusée :\n  - ${bad.join('\n  - ')}`)
  const ls = leaves(root)
  const maxDepth = Math.max(1, ...ls.map((l) => l.depth))
  const layers = new Map(ls.map((l) => [l.path, l.depth / maxDepth]))
  return {
    id: id as Mechanism['id'],
    shows,
    layers,
    parts: (part) => Object.fromEntries(ls.map((l) => [l.path, part(l.path, { lod: l.size < DETAIL || l.node.detail ? 2 : 1, layer: l.depth / maxDepth })])),
    build(c) {
      drawTree(root, c, c.B, c.z, new Map())
    },
  }
}
