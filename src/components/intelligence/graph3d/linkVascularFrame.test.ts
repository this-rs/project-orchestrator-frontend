import { describe, it, expect } from 'vitest'
import { createVascularLinks, vascularGroupFrames } from './linkVascularRenderer'
import { nearestNeighbourScale } from './linkRadius'
import { synthGraph as synthFixture } from './linkVascularFixture'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

const synthGraph = (n: number): Graph3DNode[] => synthFixture(n).nodes as unknown as Graph3DNode[]
const synthLinks = (nodes: Graph3DNode[]): Graph3DLink[] =>
  synthFixture(nodes.length).links as unknown as Graph3DLink[]

/**
 * « Les tubes bougent pendant le zoom » : with the dynamic scale the DRAWN set
 * changes at every cut (groups ↔ their files). A unit measured on it collapsed
 * when a group opened and every tube changed width at once. Given the whole
 * graph's frame, the unit — hence every radius — no longer depends on what is
 * drawn.
 */
function ring(n: number, spread: number, prefix: string): Graph3DNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, label: '', entityType: 'file', layer: 'code',
    x: Math.cos(i) * spread + (i % 3) * 7, y: Math.sin(i * 1.3) * spread, z: Math.cos(i * 0.7) * spread,
    communityId: i % 4, data: {},
  })) as Graph3DNode[]
}
const linksOf = (nodes: Graph3DNode[]): Graph3DLink[] =>
  Array.from({ length: 3200 }, (_, k) => ({
    source: nodes[k % nodes.length].id, target: nodes[(k * 7 + 3) % nodes.length].id,
    relationType: 'IMPORTS', layer: 'code', color: '#fff', width: 1, particles: 0, particleSpeed: 0,
    isInterCommunity: false, sourceCommunityId: (k % nodes.length) % 4, targetCommunityId: ((k * 7 + 3) % nodes.length) % 4,
  })).filter((l) => l.source !== l.target)

describe('vascular links — the scene frame', () => {
  const coarse = ring(40, 600, 'g') // a cut showing groups, far apart
  const fine = ring(400, 600, 'f') // a cut showing their files, close together

  it('without a frame the unit follows what is drawn (the defect)', () => {
    const a = createVascularLinks(coarse, linksOf(coarse))!
    const b = createVascularLinks(fine, linksOf(fine))!
    expect(Math.abs(a.unit!() - b.unit!())).toBeGreaterThan(0.2 * b.unit!())
  })

  it('with the whole graph\'s frame the unit — and every radius — stays put across cuts', () => {
    const frame = { unit: 12.5, center: [0, 0, 0] as [number, number, number] }
    const a = createVascularLinks(coarse, linksOf(coarse), {}, undefined, frame)!
    const b = createVascularLinks(fine, linksOf(fine), {}, undefined, frame)!
    expect(a.unit!()).toBe(12.5)
    expect(b.unit!()).toBe(12.5)
  })
})

/**
 * Le plafond de cohérence d'un faisceau (rMax) se mesurait sur les extrémités
 * DESSINÉES (rayon du groupe, longueur entre ports) : quand un groupe voisin
 * s'ouvre, les membres dessinés changent et un tronc plafonné qui ne touche pas
 * ce groupe changeait de rayon. Avec les groupes du graphe ENTIER dans le
 * cadre, le plafond ne dépend plus de ce qui est dessiné.
 */
describe('vascular links — stable per-group cap', () => {
  const nodes = synthGraph(600)
  const all = synthLinks(nodes)
  // Une autre coupe : un tiers des liens n'est plus dessiné (un groupe voisin
  // s'est ouvert, ses liens agrégés sont devenus d'autres liens), donc chaque
  // groupe perd des extrémités dessinées sans que le graphe ait bougé.
  const fewer = all.filter((_, k) => k % 3 !== 0)
  const caps = (links: Graph3DLink[], frame: Parameters<typeof createVascularLinks>[4]) => {
    const m = new Map<string, number>()
    for (const c of createVascularLinks(nodes, links, {}, undefined, frame)!.inspect!()) {
      if (c.kind === 'trunk') m.set(c.key, c.rMax)
    }
    return m
  }
  const base = { unit: nearestNeighbourScale(nodes), center: [0, 0, 0] as [number, number, number] }

  it('sans groupes dans le cadre, le plafond suit les extrémités dessinées (le défaut)', () => {
    const a = caps(all, base)
    const b = caps(fewer, base)
    let moved = 0
    for (const [key, r] of a) if (b.has(key) && Math.abs(b.get(key)! - r) > 1e-9 * r) moved++
    expect(moved).toBeGreaterThan(0)
  })

  it('avec les groupes du graphe entier, chaque tronc garde son plafond, quelle que soit la coupe', () => {
    const frame = { ...base, groups: vascularGroupFrames(nodes) }
    const a = caps(all, frame)
    const b = caps(fewer, frame)
    let common = 0
    for (const [key, r] of a) {
      if (!b.has(key)) continue
      common++
      expect(b.get(key)).toBeCloseTo(r, 9)
    }
    expect(common).toBeGreaterThan(0)
  })
})
