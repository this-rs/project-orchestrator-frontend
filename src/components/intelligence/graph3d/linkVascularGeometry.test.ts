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
    const { nodes, links } = synth(3000)
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
    // Les nœuds tiennent dans ~346 de rayon (mesuré : les vaisseaux montent à
    // ~323). Le ventre des troncs reste DANS le nuage, à 10 % près ; l'ancienne
    // borne (2 000) laissait passer une épaisseur ×10.
    let nodeR = 0
    for (const n of nodes as unknown as { x: number; y: number; z: number }[]) nodeR = Math.max(nodeR, Math.hypot(n.x, n.y, n.z))
    expect(maxR).toBeLessThan(1.1 * nodeR)
  })

  it('les liens restent fins devant l’espacement des nœuds (proportion liens/nœuds)', () => {
    const { nodes, links } = synth(3000)
    const r = createVascularLinks(nodes, links)!
    const pos = (r.object as unknown as { children: { geometry: { attributes: { position: { array: Float32Array } } } }[] })
      .children[0].geometry.attributes.position.array
    const d0 = r.unit!()
    let widest = 0
    for (const c of r.inspect!()) {
      if (c.kind === 'junction') continue
      const base = c.vertexStart + Math.floor(c.samples / 2) * 6
      let mx = 0, my = 0, mz = 0
      for (let k = 0; k < 6; k++) { mx += pos[(base + k) * 3] / 6; my += pos[(base + k) * 3 + 1] / 6; mz += pos[(base + k) * 3 + 2] / 6 }
      const rr = Math.hypot(pos[base * 3] - mx, pos[base * 3 + 1] - my, pos[base * 3 + 2] - mz)
      // Jamais plus que la loi : 0,03 · d0 · n^(1/3).
      expect(rr).toBeLessThanOrEqual(0.03 * d0 * Math.cbrt(Number(c.n)) * 1.01)
      widest = Math.max(widest, rr)
    }
    // Le plus gros faisceau (≈ 1 000 relations) reste plus fin que la moitié
    // de l'espace entre deux nœuds voisins : on voit les nœuds ENTRE les liens.
    expect(widest).toBeLessThan(0.5 * d0)
    expect(widest).toBeGreaterThan(0.1 * d0)
  })
})
