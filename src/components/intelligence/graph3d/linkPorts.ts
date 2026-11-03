// ============================================================================
// linkPorts — ports de connexion distribués autour d'un groupe
// ============================================================================
//
// PHASE 1 du plan Organic Neural Network V3.
//
// LE DÉFAUT MESURÉ. Chaque groupe exposait UN moyeu — le centre de ses nœuds —
// et tous les corridors qui le touchaient venaient s'y brancher. Résultat sur les
// captures client : vingt et un troncs convergeaient vers six points, donc un
// éventail blanc au centre, et l'impression que tout rejoignait le même sommet.
//
// LE MODÈLE. Un groupe n'a pas UN point d'attache mais PLUSIEURS PORTS, répartis
// sur son enveloppe, chacun tourné vers les groupes qu'il relie réellement. Deux
// corridors qui partent vers deux voisins éloignés angulairement reçoivent deux
// ports distincts ; deux corridors qui partent dans la même direction partagent
// le même port.
//
// CE QUE LES PORTS NE SONT PAS. Ce sont des éléments de ROUTAGE, pas des nœuds
// métier : aucun ne porte de compte, aucun ne crée de relation. Le corridor garde
// ses extrémités réelles et sa magnitude exacte ; le port ne fait que décider
// OÙ la courbe quitte l'enveloppe du groupe.
//
// Module pur : aucun three.js, aucun état, entièrement déterministe.

import type { Vec3 } from './linkVascular'

/** Enveloppe spatiale d'un groupe, réduite à ce dont le routage a besoin. */
export interface GroupEnvelope {
  id: string
  center: Vec3
  /** Rayon de l'enveloppe (demi-grand axe moyen) — les ports se posent dessus. */
  radius: number
}

/** Une liaison réelle entre deux groupes, telle que le routage la connaît. */
export interface GroupPair {
  /** Clé du corridor : c'est elle qui sera reliée aux ports. */
  key: string
  from: string
  to: string
}

/** Un port : une position sur l'enveloppe et la direction qu'il regarde. */
export interface Port {
  id: string
  group: string
  position: Vec3
  /** Direction unitaire, du centre du groupe vers l'extérieur. */
  direction: Vec3
}

export interface PortsResult {
  ports: Port[]
  /** Clé de corridor → les deux ports qu'il relie. */
  pairPorts: Map<string, { from: string; to: string }>
}

export interface PortOptions {
  /** Nombre maximal de ports par groupe (borne le surdessin). */
  maxPortsPerGroup?: number
  /**
   * Angle minimal entre deux ports d'un même groupe, en radians.
   * Deux directions plus proches que cela partagent un port : c'est ce qui
   * évite d'ouvrir un port par corridor sur un groupe très connecté.
   */
  minAngle?: number
}

export const DEFAULT_PORT_OPTIONS: Required<PortOptions> = {
  maxPortsPerGroup: 6,
  minAngle: 0.55,
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  return len < 1e-9 ? [0, 1, 0] : [v[0] / len, v[1] / len, v[2] / len]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** Part du rayon de l'enveloppe où se pose un port. */
export const PORT_DEPTH = 0.85

/**
 * Pose un port sur l'enveloppe, à partir de la SOMME des directions sortantes
 * qui y tombent. Écrit dans `out` (aucune allocation) : le renderer la rappelle
 * à chaque tick de layout pour que le port suive son groupe.
 *
 * Sur l'enveloppe, à 85 % du rayon : le port est SUR la surface du groupe, pas
 * dedans ni à l'infini.
 */
export function placePort(
  center: Vec3,
  radius: number,
  sum: Vec3,
  out: { position: Vec3; direction: Vec3 },
): void {
  const dir = norm(sum)
  out.direction[0] = dir[0]
  out.direction[1] = dir[1]
  out.direction[2] = dir[2]
  out.position[0] = center[0] + dir[0] * radius * PORT_DEPTH
  out.position[1] = center[1] + dir[1] * radius * PORT_DEPTH
  out.position[2] = center[2] + dir[2] * radius * PORT_DEPTH
}

/**
 * Répartit les ports de chaque groupe.
 *
 * Déterministe : les paires sont traitées dans l'ordre de leur clé, les groupes
 * dans l'ordre de leur identifiant. Deux appels avec les mêmes entrées rendent
 * exactement les mêmes ports.
 *
 * Un port n'est créé que là où une liaison RÉELLE part : le nombre de ports d'un
 * groupe est donc borné par ses voisins réels, jamais inventé pour remplir une
 * sphère.
 */
export function distributePorts(
  groups: readonly GroupEnvelope[],
  pairs: readonly GroupPair[],
  options: PortOptions = {},
): PortsResult {
  const { maxPortsPerGroup, minAngle } = { ...DEFAULT_PORT_OPTIONS, ...options }
  const byId = new Map(groups.map((g) => [g.id, g]))

  // Directions sortantes, accumulées par groupe.
  const outgoing = new Map<string, { key: string; dir: Vec3; side: 'from' | 'to' }[]>()
  for (const pair of [...pairs].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))) {
    const from = byId.get(pair.from)
    const to = byId.get(pair.to)
    if (!from || !to) continue
    if (pair.from === pair.to) continue // boucle interne : pas de port sortant
    const d = norm(sub(to.center, from.center))
    // Le CÔTÉ compte : un corridor a un port côté `from` et un côté `to`. Les
    // deux étaient enregistrés comme « from », donc le second écrasait le
    // premier et le port affiché pointait vers le mauvais voisin.
    const list = outgoing.get(pair.from) ?? []
    list.push({ key: pair.key, dir: d, side: 'from' })
    outgoing.set(pair.from, list)
    const back = norm(sub(from.center, to.center))
    const listB = outgoing.get(pair.to) ?? []
    listB.push({ key: pair.key, dir: back, side: 'to' })
    outgoing.set(pair.to, listB)
  }

  const ports: Port[] = []
  const pairPorts = new Map<string, { from: string; to: string }>()
  const portOfPair = (key: string, side: 'from' | 'to', portId: string) => {
    const cur = pairPorts.get(key) ?? { from: '', to: '' }
    cur[side] = portId
    pairPorts.set(key, cur)
  }

  for (const group of [...groups].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const outs = outgoing.get(group.id) ?? []
    // Accumulateur : un seau par port, avec la somme des directions qui y tombent.
    const buckets: { dir: Vec3; sum: Vec3; members: { key: string; side: 'from' | 'to' }[] }[] = []
    for (const out of outs) {
      let placed = false
      for (const b of buckets) {
        if (dot(norm(b.sum), out.dir) >= Math.cos(minAngle)) {
          b.sum = [b.sum[0] + out.dir[0], b.sum[1] + out.dir[1], b.sum[2] + out.dir[2]]
          b.members.push({ key: out.key, side: out.side })
          placed = true
          break
        }
      }
      if (!placed && buckets.length < maxPortsPerGroup) {
        buckets.push({ dir: out.dir, sum: [...out.dir], members: [{ key: out.key, side: out.side }] })
      } else if (!placed) {
        // Tous les ports sont pris : rejoindre le plus proche.
        let best = 0
        let bestDot = -Infinity
        buckets.forEach((b, i) => {
          const d = dot(norm(b.sum), out.dir)
          if (d > bestDot) { bestDot = d; best = i }
        })
        buckets[best].sum = [
          buckets[best].sum[0] + out.dir[0],
          buckets[best].sum[1] + out.dir[1],
          buckets[best].sum[2] + out.dir[2],
        ]
        buckets[best].members.push({ key: out.key, side: out.side })
      }
    }
    buckets.forEach((b, i) => {
      const port: Port = { id: `port:${group.id}:${i}`, group: group.id, position: [0, 0, 0], direction: [0, 1, 0] }
      placePort(group.center, group.radius, b.sum, port)
      ports.push(port)
      for (const member of b.members) portOfPair(member.key, member.side, port.id)
    })
  }

  return { ports, pairPorts }
}
