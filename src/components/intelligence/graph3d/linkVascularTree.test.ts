import { describe, it, expect } from 'vitest'
import { createVascularLinks } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

const node = (id: string, x: number, y: number, z: number, communityId: number) =>
  ({ id, label: '', entityType: 'file', layer: 'code', x, y, z, communityId, data: {} }) as unknown as Graph3DNode
const link = (s: string, t: string, sc: number, tc: number, relationType = 'IMPORTS') =>
  ({
    source: s, target: t, relationType, layer: 'code', sourceCommunityId: sc, targetCommunityId: tc,
    color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: sc !== tc,
  }) as unknown as Graph3DLink

describe('arbre vasculaire', () => {
  it('aucun capillaire de longueur nulle quand un sous-moyeu n’a qu’une extrémité', () => {
    // Un seul lien entre deux groupes : chaque côté n'a qu'une extrémité.
    const nodes = [node('a', -100, 0, 0, 0), node('b', 100, 0, 0, 1)]
    const r = createVascularLinks(nodes, [link('a', 'b', 0, 1)])!
    const info = r.inspect!()
    // Un tronc, deux artères qui rejoignent directement les nœuds réels (et
    // les deux capsules qui ferment les ports).
    expect(info.filter((c) => c.kind === 'capillary')).toHaveLength(0)
    expect(info.filter((c) => c.kind !== 'junction').map((c) => c.kind).sort()).toEqual(['artery', 'artery', 'trunk'])
    // the FIRST test of the file pays the renderer's module load: 20 s were seen
    // under a loaded machine with nothing wrong in the code
  }, 60_000)

  it('sur un vrai graphe, aucun conduit ne relie deux points confondus', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    // Les capsules de jonction sont, par construction, centrées sur un point.
    const degenerate = r.inspect!().filter(
      (c) => c.kind !== 'junction' && Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]) < 1e-6,
    )
    expect(degenerate).toHaveLength(0)
  })
})

describe('sous-moyeux en trois dimensions', () => {
  it('deux paquets séparés en Z (même x, y) ne sont jamais mélangés', () => {
    // Côté A : six nœuds de la communauté 0, trois en haut (z = +100), trois
    // en bas (z = −100), au MÊME (x, y) — atan2(y, x) ne les distingue pas.
    // Les identifiants alternent haut/bas pour que l'ordre ne les sépare pas
    // par accident.
    const nodes: Graph3DNode[] = []
    const links: Graph3DLink[] = []
    for (let i = 0; i < 6; i++) {
      const up = i % 2 === 0
      nodes.push(node(`a${i}`, -300 + (i >> 1) * 0.5, 0, up ? 100 : -100, 0))
    }
    nodes.push(node('b0', 300, 0, 0, 1))
    for (let i = 0; i < 6; i++) links.push(link(`a${i}`, 'b0', 0, 1))
    const r = createVascularLinks(nodes, links)!
    const info = r.inspect!()
    const zOf = new Map(nodes.map((n) => [n.id, (n as unknown as { z: number }).z]))
    const arteries = info.filter((c) => c.kind === 'artery' && c.side === 'a')
    expect(arteries.length).toBeGreaterThan(1)
    for (const a of arteries) {
      const caps = info.filter((c) => c.parent === a.id && c.kind === 'capillary')
      const members = caps.length > 0 ? caps.map((c) => c.toId) : [a.toId]
      const signs = new Set(members.map((id) => Math.sign(zOf.get(id)!)))
      expect(signs.size).toBe(1)
      // Et le sous-moyeu est du côté de ses membres, pas au milieu.
      expect(Math.abs(a.to[2])).toBeGreaterThan(50)
    }
  })
})
