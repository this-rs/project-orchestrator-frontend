import { describe, it, expect } from 'vitest'
import {
  SECTION_SEGMENTS,
  bundleTrianglesCost,
  conduitTriangles,
  layersForChannels,
  trianglesFromIndex,
} from './linkGeometryCost'
import { buildLinkSystem, fromCorridors } from './linkSystem'
import { buildCorridors } from './linkRouting'
import { createVascularLinks, layerSpecs } from './linkVascularRenderer'

function synth(n: number, groups: number) {
  let seed = 3
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`, label: '', entityType: 'file', layer: 'code',
    x: (rnd() - 0.5) * 300, y: (rnd() - 0.5) * 300, z: (rnd() - 0.5) * 300,
    communityId: i % groups, data: {},
  })) as never[]
  const links = Array.from({ length: n * 2 }, () => {
    const a = Math.floor(rnd() * n)
    const b = Math.floor(rnd() * n)
    return {
      source: `n${a}`, target: `n${b}`, relationType: 'IMPORTS', layer: 'code',
      sourceCommunityId: a % groups, targetCommunityId: b % groups,
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    } as never
  })
  return { nodes, links }
}

describe('modèle de coût géométrique', () => {
  it('compte les couches que le renderer produit vraiment', () => {
    // halo + gaine + structure + N canaux + cœur ; sans canal : cœur + une peau
    expect(layersForChannels(0)).toBe(2)
    expect(layersForChannels(0)).toBe(layerSpecs(0).length)
    expect(layersForChannels(3)).toBe(layerSpecs(3).length)

    expect(layersForChannels(3)).toBe(7)
    expect(layersForChannels(8)).toBe(12)
  })

  it('un tube coûte (samples−1) × segments × 2 × couches', () => {
    expect(conduitTriangles(9, 1)).toBe(8 * SECTION_SEGMENTS * 2)
    expect(conduitTriangles(9, 7)).toBe(8 * SECTION_SEGMENTS * 2 * 7)
    expect(conduitTriangles(1, 5)).toBe(0)
  })

  it('un bundle coûte son tronc PLUS ses branches', () => {
    const trunkOnly = bundleTrianglesCost({ samples: 9, channels: 3, branches: 0 })
    const withBranches = bundleTrianglesCost({ samples: 9, channels: 3, branches: 6 })
    expect(withBranches).toBeGreaterThan(trunkOnly)
    expect(withBranches - trunkOnly).toBe(6 * conduitTriangles(5, layersForChannels(0)))
  })

  it('lit les triangles d’un index', () => {
    expect(trianglesFromIndex(18)).toBe(6)
    expect(trianglesFromIndex(17)).toBe(5)
  })
})

describe('le budget ANNONCÉ correspond à ce qui est PRODUIT (phase 8)', () => {
  it('l’estimation ne sous-compte plus d’un ordre de grandeur', () => {
    const { nodes, links } = synth(400, 5)
    const corridors = buildCorridors(links)
    const estimate = buildLinkSystem(fromCorridors(corridors)).stats.triangles
    const renderer = createVascularLinks(nodes, links)!
    const real = renderer.stats!.triangles

    expect(real).toBeGreaterThan(0)
    expect(estimate).toBeGreaterThan(0)
    // L'ancienne formule comptait UN tube par conduit : elle annonçait cinq à dix
    // fois moins que ce que le renderer produisait. On borne désormais l'écart.
    const ratio = real / estimate
    expect(ratio).toBeLessThan(4)
    expect(ratio).toBeGreaterThan(0.2)
  })

  it('le renderer rapporte des mesures cohérentes', () => {
    const { nodes, links } = synth(300, 4)
    const r = createVascularLinks(nodes, links)!
    const s = r.stats!
    expect(s.vertices).toBeGreaterThan(0)
    expect(s.triangles).toBeGreaterThan(0)
    expect(s.conduits).toBeGreaterThan(0)
    expect(s.transparentTriangles).toBeLessThanOrEqual(s.triangles)
  })
})
