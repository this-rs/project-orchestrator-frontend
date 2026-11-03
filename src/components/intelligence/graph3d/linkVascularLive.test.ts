import { describe, it, expect } from 'vitest'
import { createVascularLinks } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'

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
