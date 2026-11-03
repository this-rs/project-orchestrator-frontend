import { describe, it, expect } from 'vitest'
import {
  SECTION_SEGMENTS,
  bundleTrianglesCost,
  conduitTriangles,
  layersForChannels,
  trianglesFromIndex,
  SUB_HUBS_PER_END,
  CAPILLARIES_PER_SUB_HUB,
  BRANCH_SAMPLES,
  ARTERY_SAMPLES,
  CAPILLARY_SAMPLES,
  conduitLayers,
  sideTree,
} from './linkGeometryCost'
import { buildLinkSystem, fromCorridors } from './linkSystem'
import { buildCorridors } from './linkRouting'
import { createVascularLinks } from './linkVascularRenderer'

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
    // halo + gaine + structure + N canaux + cœur
    expect(layersForChannels(0)).toBe(4)
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
    // Puis la phase 8 bis : le modèle compte les voies (familles), les couches
    // réelles (≥ 6, canaux bornés [2, 5]), et l'arbre réel de chaque côté
    // (artères à 7 échantillons, capillaires à 5). Quand toutes les extrémités
    // existent, l'estimation EST la géométrie produite — au triangle près.
    expect(estimate).toBe(real)
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

describe('le modèle partagé suit le renderer à toutes les tailles', () => {
  it('estimation = triangles produits, de 2 à 40 communautés et à plusieurs budgets', () => {
    for (const [n, groups, maxTriangles] of [
      [60, 2, 240_000],
      [400, 5, 240_000],
      [2_000, 40, 240_000],
      [2_000, 40, 60_000],
    ] as const) {
      const { nodes, links } = synth(n, groups)
      const estimate = buildLinkSystem(fromCorridors(buildCorridors(links)), { maxTriangles }).stats.triangles
      const real = createVascularLinks(nodes, links, { maxTriangles })!.stats!.triangles
      expect(estimate).toBe(real)
      expect(real).toBeLessThanOrEqual(maxTriangles)
    }
  })

  it('exporte les constantes que le renderer doit importer', () => {
    expect(SUB_HUBS_PER_END).toBe(3)
    expect(CAPILLARIES_PER_SUB_HUB).toBe(3)
    expect(BRANCH_SAMPLES).toBe(5)
    expect(ARTERY_SAMPLES).toBe(BRANCH_SAMPLES + 2)
    expect(CAPILLARY_SAMPLES).toBe(BRANCH_SAMPLES)
    // couches d'un conduit = halo + gaine + structure + canaux bornés [2, 5] + cœur
    expect(conduitLayers(1)).toBe(6)
    expect(conduitLayers(3)).toBe(7)
    expect(conduitLayers(40)).toBe(9)
    expect(conduitLayers(40, true)).toBe(6)
  })

  it('l’arbre d’un côté : ≤ 3 artères, ≤ 3 capillaires chacune, groupes contigus', () => {
    expect(sideTree(0)).toEqual({ arteries: 0, capillaries: 0 })
    expect(sideTree(1)).toEqual({ arteries: 1, capillaries: 1 })
    expect(sideTree(4)).toEqual({ arteries: 2, capillaries: 4 }) // 2 + 2
    expect(sideTree(7)).toEqual({ arteries: 3, capillaries: 7 }) // 3 + 3 + 1
    expect(sideTree(100)).toEqual({ arteries: 3, capillaries: 9 })
  })
})
