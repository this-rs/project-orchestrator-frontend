import { describe, it, expect } from 'vitest'
import { createVascularLinks } from './linkVascularRenderer'

function synth(n: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`, label: '', entityType: 'file', layer: 'code',
    x: Math.cos(i * 0.7) * 200, y: Math.sin(i * 1.3) * 200, z: Math.cos(i * 0.21) * 200,
    communityId: i % 6, data: {},
  })) as never[]
  const links = Array.from({ length: n * 2 }, (_, i) => ({
    source: `n${(i * 7) % n}`, target: `n${(i * 13 + 5) % n}`,
    relationType: 'IMPORTS', layer: 'code', sourceCommunityId: ((i * 7) % n) % 6,
    targetCommunityId: ((i * 13 + 5) % n) % 6, color: '#fff', width: 1,
    particles: 0, particleSpeed: 0, isInterCommunity: false,
  })) as never[]
  return { nodes, links }
}

/**
 * Garde-fou d'enveloppe : un vaisseau lumineux peut déborder du graphe (l'arc du
 * tronc le fait), mais pas le DOUBLER. Sans ce test, une erreur de rayon — une
 * unité absolue au lieu d'une fraction de scène, ce qui est déjà arrivé — rend
 * des tubes qui avalent la vue, et ça ne se voit qu'à l'écran.
 */
describe('géométrie vasculaire', () => {
  it('reste dans une enveloppe plausible autour du graphe', () => {
    const { nodes, links } = synth(400)
    const r = createVascularLinks(nodes, links)
    expect(r).not.toBeNull()
    const group = r!.object as unknown as { children: { geometry: { attributes: { position: { array: Float32Array } } } }[] }
    const pos = group.children[0].geometry.attributes.position.array
    let maxR = 0
    let nan = 0
    for (let i = 0; i < pos.length; i += 3) {
      const d = Math.hypot(pos[i], pos[i + 1], pos[i + 2])
      if (!Number.isFinite(d)) nan++
      if (d > maxR) maxR = d
    }
    expect(nan).toBe(0)
    // Le graphe tient dans ~200 de rayon ; un vaisseau ne doit pas le dépasser
    // de plus du double, sinon c'est une baudruche.
    expect(maxR).toBeLessThan(600)
  })
})
