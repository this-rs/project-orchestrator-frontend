// ============================================================================
// linkVascularTree — la forme d'un arbre vasculaire, calculée UNE fois
// ============================================================================
//
// Le renderer (qui dessine) et le budget (qui décide quoi dessiner) doivent
// compter la même chose, au triangle près. Or la forme d'un arbre dépend des
// POSITIONS : les sous-moyeux regroupent les extrémités par direction dans
// l'espace, et le contenu de chaque conduit (donc ses couches) dépend de ce que
// porte son paquet. Ce module calcule cette forme — voies, paquets, contenu —
// et l'énumère conduit par conduit. Le renderer construit en suivant cette
// énumération ; le budget l'additionne (`treeShape`). Une seule source.
//
// Module pur : aucun three.js.

import type { Graph3DLink } from './useGraph3DLayout'
import {
  endpointId,
  endpointToken,
  linkMultiplicity,
  UNKNOWN_RELATION,
  type Corridor,
  type CorridorFamily,
} from './linkRouting'
import { describeMagnitude } from './linkMagnitude'
import { morphologyShape } from './linkMorphology'
import {
  ARTERY_SAMPLES,
  CAPILLARIES_PER_SUB_HUB,
  CAPILLARY_SAMPLES,
  JUNCTION_SAMPLES,
  SUB_HUBS_PER_END,
  conduitLayers,
  conduitTriangles,
  layersForChannels,
  trunkLanes,
  type ExactShape,
} from './linkGeometryCost'
import type { SystemCorridor } from './linkSystem'

type Vec3 = [number, number, number]

export interface Point3 {
  x: number
  y: number
  z: number
}

/** Ce que porte une extrémité réelle d'un côté du corridor. */
export interface TreeEnd {
  id: string
  deg: number
  n: bigint
  families: Set<string>
}

/** Un paquet spatial : tous ses membres (comptés), et ceux qui reçoivent un capillaire. */
export interface TreeGroup {
  all: TreeEnd[]
  drawn: TreeEnd[]
}

export interface TreeSide {
  groups: TreeGroup[]
  /** Extrémités, les mieux connectées d'abord. */
  ranked: TreeEnd[]
}

export interface TreeLane {
  family: string | null
  n: bigint
  families: number
}

export interface CorridorTree {
  corridor: Corridor
  lanes: TreeLane[]
  /**
   * Extrémités du tronc : `ports` pour un corridor entre deux groupes (le
   * renderer les tient), deux nœuds réels distincts pour un corridor interne,
   * ou null quand il n'y en a pas deux (pas de tronc).
   */
  trunk: { kind: 'ports' } | { kind: 'nodes'; from: string; to: string } | null
  a: TreeSide
  b: TreeSide
}

/**
 * Regroupe les extrémités RÉELLES d'un côté en sous-moyeux spatiaux.
 *
 * En TROIS dimensions : chaque extrémité est une direction sur la sphère autour
 * du centre du côté (atan2(y, x) ignorait z). Graines par point le plus éloigné
 * (déterministe), puis chaque extrémité rejoint la graine la plus proche en
 * angle. Chaque paquet garde TOUS ses membres (ils comptent dans ce que porte
 * l'artère) et désigne ceux qui reçoivent un capillaire (les mieux connectés).
 */
export function groupSide(side: Map<string, TreeEnd>, positionOf: (id: string) => Point3 | undefined): TreeSide {
  const unique = [...side.values()].sort((p, q) => q.deg - p.deg || (p.id < q.id ? -1 : 1))
  let cx = 0, cy = 0, cz = 0
  for (const x of unique) {
    const n = positionOf(x.id)!
    cx += n.x; cy += n.y; cz += n.z
  }
  cx /= unique.length; cy /= unique.length; cz /= unique.length
  const dirs = unique.map((x) => {
    const n = positionOf(x.id)!
    const dx = n.x - cx, dy = n.y - cy, dz = n.z - cz
    const len = Math.hypot(dx, dy, dz)
    return len > 1e-9 ? ([dx / len, dy / len, dz / len] as Vec3) : null
  })
  const dot = (a: Vec3 | null, b: Vec3 | null) => (a && b ? a[0] * b[0] + a[1] * b[1] + a[2] * b[2] : 1)
  const seeds: number[] = []
  const first = dirs.findIndex((d) => d !== null)
  if (first >= 0) seeds.push(first)
  while (seeds.length > 0 && seeds.length < SUB_HUBS_PER_END) {
    let best = -1, bestSim = Infinity
    dirs.forEach((d, i) => {
      if (!d || seeds.includes(i)) return
      const sim = Math.max(...seeds.map((s) => dot(d, dirs[s])))
      if (sim < bestSim - 1e-12) { bestSim = sim; best = i }
    })
    // Plus aucune direction vraiment distincte : pas de graine de plus.
    if (best < 0 || bestSim > 1 - 1e-9) break
    seeds.push(best)
  }
  const buckets: TreeEnd[][] = seeds.map(() => [])
  unique.forEach((e, i) => {
    if (seeds.length === 0) return
    let g = 0, gSim = -Infinity
    seeds.forEach((s, k) => {
      const sim = dot(dirs[i], dirs[s])
      if (sim > gSim + 1e-12) { gSim = sim; g = k }
    })
    buckets[g].push(e)
  })
  // Extrémités toutes au centre (aucune direction) : un seul paquet.
  if (seeds.length === 0) buckets.push([...unique])
  const groups: TreeGroup[] = []
  for (const all of buckets) {
    if (all.length === 0) continue
    const drawn = [...all].sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1)).slice(0, CAPILLARIES_PER_SUB_HUB)
    groups.push({ all, drawn })
  }
  return { groups, ranked: unique }
}

/**
 * La forme d'un corridor : ses voies (une par famille, la dernière recueille
 * les familles au-delà des voies dessinables — la somme des voies vaut le
 * corridor), ses deux côtés groupés en sous-moyeux, et son tronc. Null quand un
 * côté n'a aucune extrémité réelle positionnée.
 */
export function corridorTree(
  corridor: Corridor,
  positionOf: (id: string) => Point3 | undefined,
  morphologyChannels: number,
): CorridorTree | null {
  const sideA = new Map<string, TreeEnd>()
  const sideB = new Map<string, TreeEnd>()
  const add = (side: Map<string, TreeEnd>, id: string, link: Graph3DLink) => {
    let e = side.get(id)
    if (!e) {
      e = { id, deg: 0, n: 0n, families: new Set() }
      side.set(id, e)
    }
    e.deg++
    e.n += linkMultiplicity(link)
    e.families.add(link.relationType || UNKNOWN_RELATION)
  }
  for (const link of corridor.links) {
    const s = endpointId(link.source)
    const t = endpointId(link.target)
    if (!positionOf(s) || !positionOf(t)) continue
    if (endpointToken(link.sourceCommunityId, s) === corridor.from) {
      add(sideA, s, link)
      add(sideB, t, link)
    } else {
      add(sideA, t, link)
      add(sideB, s, link)
    }
  }
  if (sideA.size === 0 || sideB.size === 0) return null
  const a = groupSide(sideA, positionOf)
  const b = groupSide(sideB, positionOf)

  const lanes = trunkLanes(corridor.families.length, morphologyChannels)
  const families = [...corridor.families]
    .sort((x, y) => (y.exactCount === x.exactCount ? (x.relation < y.relation ? -1 : 1) : y.exactCount > x.exactCount ? 1 : -1))
  const laneDefs: TreeLane[] = families.slice(0, lanes).map((f) => ({ family: f.relation, n: f.exactCount, families: 1 }))
  for (const f of families.slice(lanes)) {
    const last = laneDefs[laneDefs.length - 1]
    last.n += f.exactCount
    last.families++
  }
  if (laneDefs.length === 0) laneDefs.push({ family: null, n: corridor.magnitude.exactCount, families: 1 })

  let trunk: CorridorTree['trunk'] = null
  if (corridor.from !== corridor.to) {
    trunk = { kind: 'ports' }
  } else {
    // Corridor interne : deux extrémités réelles DISTINCTES, jamais un nœud à
    // lui-même (un tube de longueur nulle par famille).
    const from = a.ranked[0].id
    const to = b.ranked.find((e) => e.id !== from)?.id
    if (to !== undefined) trunk = { kind: 'nodes', from, to }
  }
  return { corridor, lanes: laneDefs, trunk, a, b }
}

/** Un conduit de l'arbre, dans l'ordre exact où le renderer le construit. */
export type TreeConduit =
  | { kind: 'trunk'; lane: number; def: TreeLane }
  | { kind: 'junction'; side: 'a' | 'b'; at: 'port' | 'sub'; group?: number; n: bigint }
  | { kind: 'artery'; side: 'a' | 'b'; group: number; direct: TreeEnd | null; n: bigint; nEnd: bigint; families: number }
  | { kind: 'capillary'; side: 'a' | 'b'; group: number; end: TreeEnd }

/**
 * Énumère les conduits d'un arbre : les voies, puis de chaque côté la capsule
 * du port, et par paquet son artère (directe vers le nœud pour un paquet d'une
 * extrémité, sinon vers un sous-moyeu fermé par une capsule, puis ses
 * capillaires).
 */
export function forEachTreeConduit(tree: CorridorTree, visit: (c: TreeConduit) => void): void {
  if (tree.trunk) tree.lanes.forEach((def, lane) => visit({ kind: 'trunk', lane, def }))
  for (const side of ['a', 'b'] as const) {
    const groups = tree[side].groups
    if (groups.length === 0) continue
    if (tree.trunk) visit({ kind: 'junction', side, at: 'port', n: tree.corridor.magnitude.exactCount })
    groups.forEach((g, gi) => {
      const families = new Set<string>()
      for (const e of g.all) for (const f of e.families) families.add(f)
      if (g.all.length === 1) {
        const e = g.all[0]
        visit({ kind: 'artery', side, group: gi, direct: e, n: e.n, nEnd: e.n, families: e.families.size })
        return
      }
      const total = g.all.reduce((acc, e) => acc + e.n, 0n)
      const drawnN = g.drawn.reduce((acc, e) => acc + e.n, 0n)
      visit({ kind: 'artery', side, group: gi, direct: null, n: total, nEnd: drawnN, families: families.size })
      visit({ kind: 'junction', side, at: 'sub', group: gi, n: drawnN })
      for (const e of g.drawn) visit({ kind: 'capillary', side, group: gi, end: e })
    })
  }
}

/** Couches d'un conduit de l'arbre (la loi d'échelle décide de son contenu). */
export function treeConduitLayers(c: TreeConduit, mobile: boolean): number {
  switch (c.kind) {
    case 'trunk': return conduitLayers(Number(c.def.n), c.def.families, mobile)
    case 'junction': return layersForChannels(0)
    case 'artery': return conduitLayers(Number(c.n), c.families, mobile)
    case 'capillary': return conduitLayers(Number(c.end.n), c.end.families.size, mobile)
  }
}

/** Échantillons d'un conduit de l'arbre (le tronc suit le LOD). */
export function treeConduitSamples(c: TreeConduit, trunkSamples: number): number {
  switch (c.kind) {
    case 'trunk': return trunkSamples
    case 'junction': return JUNCTION_SAMPLES
    case 'artery': return ARTERY_SAMPLES
    case 'capillary': return CAPILLARY_SAMPLES
  }
}

/** Forme exacte d'un arbre, pour le budget : couches des voies + triangles du reste. */
export function treeShape(tree: CorridorTree | null, mobile: boolean): ExactShape | null {
  if (!tree) return null
  const laneLayers: number[] = []
  let treeTriangles = 0
  forEachTreeConduit(tree, (c) => {
    const layers = treeConduitLayers(c, mobile)
    if (c.kind === 'trunk') laneLayers.push(layers)
    else treeTriangles += conduitTriangles(treeConduitSamples(c, 0), layers)
  })
  return { laneLayers, treeTriangles }
}

/**
 * Corridor SYNTHÉTIQUE d'un faisceau agrégé : tracé le long de la paire de son
 * plus gros membre (from/to), portant la somme exacte de ses membres, leurs
 * liens réels et leurs familles fusionnées. Les liens d'un membre qui ne
 * touchent pas `from` rejoignent le côté `to` (règle de côté du routage).
 */
export function aggregateCorridor(key: string, from: string, to: string, members: readonly Corridor[]): Corridor {
  const links: Graph3DLink[] = []
  const byRelation = new Map<string, bigint>()
  let total = 0n
  for (const m of members) {
    for (const l of m.links) links.push(l)
    for (const f of m.families) byRelation.set(f.relation, (byRelation.get(f.relation) ?? 0n) + f.exactCount)
    total += m.magnitude.exactCount
  }
  const families: CorridorFamily[] = [...byRelation.keys()].sort().map((relation) => {
    const exactCount = byRelation.get(relation)!
    return { relation, exactCount, share: total > 0n ? Number((exactCount * 1_000_000n) / total) / 1_000_000 : 0 }
  })
  return { key, from, to, families, magnitude: describeMagnitude(total), links }
}

/** Corridor à dessiner pour un faisceau du système (seul, ou agrégat de ses membres). */
export function bundleCorridor(
  corridor: SystemCorridor,
  members: readonly string[] | undefined,
  corridorByKey: ReadonlyMap<string, Corridor>,
): Corridor | null {
  if (!members) return corridorByKey.get(corridor.key) ?? null
  const real = members.map((k) => corridorByKey.get(k)).filter((c): c is Corridor => c !== undefined)
  if (real.length === 0) return null
  return aggregateCorridor(corridor.key, corridor.from, corridor.to, real)
}

/**
 * `shapeOf` pour buildLinkSystem : la forme EXACTE que le renderer vasculaire
 * construira, sur les positions courantes. Le renderer et les tests de budget
 * passent par elle — c'est ce qui rend l'estimation égale à la production.
 */
export function vascularShapeOf(
  positionOf: (id: string) => Point3 | undefined,
  corridors: readonly Corridor[],
  mobile: boolean,
): (corridor: SystemCorridor, members?: readonly string[]) => ExactShape | null {
  const byKey = new Map(corridors.map((c) => [c.key, c]))
  return (corridor, members) => {
    const real = bundleCorridor(corridor, members, byKey)
    if (!real) return null
    const channels = morphologyShape(corridor.magnitude).graphical.channels
    return treeShape(corridorTree(real, positionOf, channels), mobile)
  }
}
