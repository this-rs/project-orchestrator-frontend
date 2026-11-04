import { describe, it, expect } from 'vitest'
import { createVascularLinks } from './linkVascularRenderer'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

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
