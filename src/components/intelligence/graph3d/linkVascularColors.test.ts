import { describe, it, expect } from 'vitest'
import { createVascularLinks, layerSpecs, type VascularLinkRenderer } from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'

type Attrs = Record<string, { array: Float32Array }>
const attrs = (r: VascularLinkRenderer) =>
  (r.object as unknown as { children: { geometry: { attributes: Attrs } }[] }).children[0].geometry.attributes

/** Opacités de chaque couche d'un conduit, lues sur le premier anneau de la couche. */
function layerAlphas(r: VascularLinkRenderer, conduitIndex: number): number[] {
  const c = r.inspect!()[conduitIndex]
  const a = attrs(r).aAlpha.array
  return Array.from({ length: c.layers }, (_, l) => a[c.vertexStart + l * c.samples * 6])
}

/**
 * La recoloration (survol, sélection, activation) repeint TOUTES les couches et
 * garde l'identité de chacune. Elle ne repeignait que la couche 0 (le halo) avec
 * l'alpha brut du style : halo dix fois trop opaque, seul porteur de la couleur
 * de surbrillance, puis remis à l'ancienne couleur au tick de layout suivant.
 */
describe('recoloration vasculaire', () => {
  const highlight = () => ({ r: 1, g: 0.6, b: 0, a: 0.95 })

  it('chaque couche garde son opacité propre (halo ≪ cœur)', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    r.updateColors(highlight)
    // Couche externe : le halo (0,03) quand le conduit a des canaux, la peau
    // unique (0,08) quand il ne porte qu'une relation.
    const outer = Math.max(layerSpecs(5)[0].alpha, layerSpecs(0)[0].alpha)
    const core = layerSpecs(5)[layerSpecs(5).length - 1].alpha
    for (let i = 0; i < r.inspect!().length; i += 7) {
      const al = layerAlphas(r, i)
      expect(al[0]).toBeLessThanOrEqual(outer + 1e-6)
      expect(al[al.length - 1]).toBeGreaterThan(al[0] * 5)
      expect(al[al.length - 1]).toBeLessThanOrEqual(core + 1e-6)
    }
  })

  it('la surbrillance atteint toutes les couches, et la famille reste lisible', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    const before = Float32Array.from(attrs(r).aColor.array)
    r.updateColors(highlight)
    const after = attrs(r).aColor.array
    const info = r.inspect!()
    const lane = info.findIndex((c) => c.kind === 'trunk' && c.family)
    const c = info[lane]
    for (let l = 0; l < c.layers; l++) {
      const v = (c.vertexStart + l * c.samples * 6) * 3
      // Chaque couche a bougé vers la surbrillance…
      expect(after[v]).not.toBeCloseTo(before[v], 4)
      // … sans devenir la couleur de surbrillance pure : la famille module.
      expect(Math.abs(after[v] - 1) + Math.abs(after[v + 1] - 0.6) + Math.abs(after[v + 2])).toBeGreaterThan(0.1)
    }
  })

  it('le tick de layout suivant ne remet pas l’ancienne couleur (pas de clignotement)', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    r.updateColors(highlight)
    const col = Float32Array.from(attrs(r).aColor.array)
    const alp = Float32Array.from(attrs(r).aAlpha.array)
    r.updatePositions()
    const diff = (x: Float32Array, y: Float32Array) => x.reduce((n, v, i) => n + (v === y[i] ? 0 : 1), 0)
    expect(diff(attrs(r).aColor.array, col)).toBe(0)
    expect(diff(attrs(r).aAlpha.array, alp)).toBe(0)
  })

  it('updateColorsForNodes ne repeint que les faisceaux de ces nœuds', () => {
    const { nodes, links } = synthGraph(3001)
    const r = createVascularLinks(nodes, links)!
    r.updateColors(() => ({ r: 0.2, g: 0.2, b: 0.2, a: 0.5 }))
    const before = Float32Array.from(attrs(r).aColor.array)
    r.updateColorsForNodes(['n0'], highlight)
    const after = attrs(r).aColor.array
    const info = r.inspect!()
    const touchedKeys = new Set<string>()
    let untouchedChanged = 0
    for (const c of info) {
      const v = c.vertexStart * 3
      if (after[v] !== before[v]) touchedKeys.add(c.key)
    }
    for (const c of info) {
      if (touchedKeys.has(c.key)) continue
      const v = c.vertexStart * 3
      if (after[v] !== before[v]) untouchedChanged++
    }
    expect(touchedKeys.size).toBeGreaterThan(0)
    expect(touchedKeys.size).toBeLessThan(new Set(info.map((c) => c.key)).size)
    expect(untouchedChanged).toBe(0)
  })
})
