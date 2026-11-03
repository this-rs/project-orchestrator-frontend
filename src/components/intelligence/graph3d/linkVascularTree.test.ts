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
  })

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
