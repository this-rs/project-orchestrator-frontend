import { describe, it, expect } from 'vitest'
import { buildOrganicGroups } from './organicGroups'
import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

const node = (id: string, entityType: string, o: Partial<Graph3DNode> = {}): Graph3DNode => ({
  id, label: id, entityType, layer: o.layer ?? 'code',
  x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, data: {}, ...o,
})
const link = (source: string, target: string, relationType = 'IMPORTS'): Graph3DLink => ({
  source, target, relationType, layer: 'code',
})

// Two code communities, a skill with members, a lone protocol state, a disconnected pair.
const nodes: Graph3DNode[] = [
  ...Array.from({ length: 40 }, (_, i) => node(`f${i}`, 'file', { communityId: i < 20 ? 1 : 2, x: i, y: i * 0.5, z: -i })),
  node('skill-a', 'skill', { layer: 'knowledge' }),
  node('m1', 'note', { layer: 'knowledge' }),
  node('m2', 'note', { layer: 'knowledge' }),
  node('state-x', 'protocol_state', { layer: 'knowledge' }),
  node('iso-1', 'file', { groupKey: 'dsrc/lonely' }),
  node('iso-2', 'file', { groupKey: 'dsrc/lonely' }),
]
const links: Graph3DLink[] = [
  ...Array.from({ length: 19 }, (_, i) => link(`f${i}`, `f${i + 1}`)),   // community 1 chain
  link('f5', 'f25', 'CALLS'),                                             // one cross-community edge
  link('skill-a', 'm1', 'BELONGS_TO_SKILL'),
  link('skill-a', 'm2', 'HAS_MEMBER'),
  link('m1', 'state-x', 'HAS_STATE'),
]
// iso-1 ↔ iso-2 is deliberately NOT linked to anything else.
links.push(link('iso-1', 'iso-2', 'IMPORTS'))

describe('buildOrganicGroups', () => {
  const h = buildOrganicGroups(nodes, links)

  it('keeps every real node, exactly once per hierarchy', () => {
    for (const kind of ['structural', 'semantic', 'component'] as const) {
      const seen = h.groups.filter((g) => g.kind === kind).flatMap((g) => g.members)
      expect(seen.sort()).toEqual(nodes.map((n) => n.id).sort())
    }
  })

  it('conserves counts per entity type in the semantic hierarchy', () => {
    const totals: Record<string, number> = {}
    for (const g of h.groups.filter((x) => x.kind === 'semantic')) {
      for (const [t, c] of Object.entries(g.byType)) totals[t] = (totals[t] ?? 0) + c
    }
    const expected: Record<string, number> = {}
    for (const n of nodes) expected[n.entityType] = (expected[n.entityType] ?? 0) + 1
    expect(totals).toEqual(expected)
  })

  it('never merges a small family into an "other" bucket', () => {
    const state = h.byId.get('sem:knowledge:protocol_state')
    expect(state?.count).toBe(1)
    expect(state?.members).toEqual(['state-x'])
  })

  it('counts internal and external edges exactly', () => {
    const c1 = h.byId.get(h.structuralOf.get('f0') as string)!
    expect(c1.count).toBe(20)
    // f5–f25 leaves community 1 (f0..f19) for community 2 (f20..f39): one external edge.
    expect(c1.externalEdgeCount).toBe(1)
    expect(c1.internalEdgeCount).toBe(19)
    expect(c1.relationDistribution.CALLS).toBe(1)
  })

  it('never links disconnected entities', () => {
    expect(h.componentOf.get('iso-1')).toBe(h.componentOf.get('iso-2'))
    expect(h.componentOf.get('iso-1')).not.toBe(h.componentOf.get('f0'))
    const comp = h.byId.get(h.componentOf.get('iso-1') as string)!
    expect(comp.externalEdgeCount).toBe(0)
    expect(comp.members.sort()).toEqual(['iso-1', 'iso-2'])
  })

  it('is deterministic whatever the input order', () => {
    const shuffled = [...nodes].reverse()
    const shuffledLinks = [...links].reverse()
    expect(buildOrganicGroups(shuffled, shuffledLinks).groups).toEqual(h.groups)
  })

  it('yields finite geometry, even for a single node', () => {
    for (const g of h.groups) {
      expect(Number.isFinite(g.radius)).toBe(true)
      expect(Number.isFinite(g.centroid.x)).toBe(true)
      expect(g.radius).toBeGreaterThanOrEqual(6)
    }
  })

  it('picks the highest-degree member as anchor', () => {
    const skill = h.byId.get('sem:knowledge:skill')!
    expect(skill.anchor).toBe('skill-a')
  })
})
