import { describe, it, expect } from 'vitest'
import { createVascularLinks } from './linkVascularRenderer'

/** Six communautés écartées, quatre familles : assez pour des ports, des sous-moyeux et des voies. */
export function synthGraph(n: number, offset: [number, number, number] = [0, 0, 0]) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`, label: '', entityType: 'file', layer: 'code',
    x: Math.cos(i * 0.7) * 200 + (i % 6) * 300 + offset[0],
    y: Math.sin(i * 1.3) * 200 + offset[1],
    z: Math.cos(i * 0.21) * 200 + offset[2],
    communityId: i % 6, data: {},
  })) as never[]
  const links = Array.from({ length: n * 2 }, (_, i) => ({
    source: `n${(i * 7) % n}`, target: `n${(i * 13 + 5) % n}`,
    relationType: ['IMPORTS', 'CALLS', 'CO_CHANGED', 'TOUCHES'][i % 4], layer: 'code',
    sourceCommunityId: ((i * 7) % n) % 6, targetCommunityId: ((i * 13 + 5) % n) % 6,
    color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
  })) as never[]
  return { nodes, links }
}

const positions = (r: unknown) =>
  (r as { object: { children: { geometry: { attributes: { position: { array: Float32Array } } } }[] } })
    .object.children[0].geometry.attributes.position.array

/**
 * Les ancres de routage (ports, sous-moyeux) SUIVENT les nœuds.
 *
 * Elles étaient copiées une fois à la construction : quand le layout bougeait
 * les nœuds, les capillaires suivaient mais troncs et artères restaient sur
 * place. L'invariant le plus strict : mettre à jour un renderer après un
 * déplacement doit donner EXACTEMENT ce que donnerait un renderer neuf
 * construit aux nouvelles positions.
 */
describe('ancres vasculaires vivantes', () => {
  it('updatePositions après un déplacement == construction neuve aux nouvelles positions', () => {
    const { nodes, links } = synthGraph(3001)
    const live = createVascularLinks(nodes, links)!
    expect(live).not.toBeNull()
    for (const n of nodes as { x: number; y: number; z: number }[]) { n.x += 1000; n.y -= 250; n.z += 400 }
    live.updatePositions()
    const fresh = createVascularLinks(nodes, links)!
    const a = positions(live)
    const b = positions(fresh)
    expect(a.length).toBe(b.length)
    let off = 0
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-2 * Math.max(1, Math.abs(b[i]))) off++
    expect(off).toBe(0)
  })

  it('les ports et sous-moyeux exposés par inspect() se déplacent avec leur groupe', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    const before = r.inspect!()
    for (const n of nodes as { x: number }[]) n.x += 1000
    r.updatePositions()
    const after = r.inspect!()
    for (let i = 0; i < before.length; i++) {
      expect(after[i].from[0] - before[i].from[0]).toBeCloseTo(1000, 3)
      expect(after[i].to[0] - before[i].to[0]).toBeCloseTo(1000, 3)
    }
  })
})
