import { describe, it, expect } from 'vitest'
import { NOMENCLATURE, NAV_GROUPS, segmentLabel, entityNoun } from './nomenclature'

describe('nomenclature', () => {
  it('gives every concept a distinct route segment', () => {
    const segments = Object.values(NOMENCLATURE).map((c) => c.segment)
    expect(new Set(segments).size).toBe(segments.length)
  })

  it('lists each concept at most once in the sidebar', () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(NOMENCLATURE[key]).toBeDefined()
  })

  it('reaches the pages that used to be orphans from the sidebar', () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items)
    for (const key of ['tasks', 'triggers', 'sharing', 'neuralRouting', 'featureGraphs'] as const) {
      expect(keys).toContain(key)
    }
  })

  it('names segments and entities from the registry', () => {
    expect(segmentLabel('milestones')).toBe('Objectives')
    expect(segmentLabel('project-milestones')).toBe('Objectives')
    expect(segmentLabel('rfcs')).toBe('Proposals')
    expect(segmentLabel('3f2a9c1e-0000-4000-8000-000000000000')).toBeNull()
    expect(entityNoun('plans')).toBe('Plan')
    expect(entityNoun('rfcs')).toBe('Proposal')
    expect(entityNoun('unknown')).toBeNull()
  })
})
