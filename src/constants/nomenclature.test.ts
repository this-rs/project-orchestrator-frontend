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

  it('organises the sidebar by phase of the work, in seven groups', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'Focus',
      'Plan',
      'Design',
      'Build',
      'Ship',
      'Knowledge',
      'System',
    ])
  })

  it('lists every concept that has a page in the sidebar', () => {
    const keys = new Set(NAV_GROUPS.flatMap((g) => g.items))
    // `insights` lives inside a project; `today` is the application root (global chrome),
    // not an entry of a workspace's sidebar.
    for (const key of Object.keys(NOMENCLATURE)) {
      if (key === 'insights' || key === 'today') continue
      expect(keys.has(key as keyof typeof NOMENCLATURE)).toBe(true)
    }
  })

  it('keeps Today out of a workspace sidebar: it is the root above the workspaces', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items)).not.toContain('today')
  })

  describe('explain — the three sentences that introduce a screen (AUDIENCE.md § 9)', () => {
    /** Words the site bans from any explanation: technical names and the words the product renamed. */
    const BANNED = /\b(agents?|milestones?|rfcs?|mcp|neo4j|graphs?|fsm|louvain)\b/i
    const LINES = ['what', 'why', 'different'] as const
    const entries = Object.entries(NOMENCLATURE) as [string, (typeof NOMENCLATURE)[keyof typeof NOMENCLATURE]][]

    it('gives every concept three non-empty lines', () => {
      for (const [key, c] of entries) {
        for (const line of LINES) {
          expect(c.explain[line].trim().length, `${key}.explain.${line}`).toBeGreaterThan(0)
        }
      }
    })

    it('uses the product\'s words only: never agent, milestone, RFC, MCP, Neo4j, graph, FSM or Louvain', () => {
      for (const [key, c] of entries) {
        for (const line of LINES) {
          const m = c.explain[line].match(BANNED)
          expect(m, `${key}.explain.${line} contains « ${m?.[0]} »`).toBeNull()
        }
      }
    })

    it('keeps each line short enough for two lines on a phone (~150 characters)', () => {
      for (const [key, c] of entries) {
        for (const line of LINES) {
          expect(c.explain[line].length, `${key}.explain.${line}`).toBeLessThanOrEqual(150)
        }
      }
    })

    it('ends each line with a full stop: one sentence, said once', () => {
      for (const [key, c] of entries) {
        for (const line of LINES) {
          expect(c.explain[line], `${key}.explain.${line}`).toMatch(/\.$/)
        }
      }
    })
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
