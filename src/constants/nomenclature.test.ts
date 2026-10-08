import { describe, it, expect } from 'vitest'
import { NOMENCLATURE, NAV_GROUPS, NAV_TEXT, TODAY_WORDS, CARD_CONCEPTS, segmentLabel, entityNoun, tintStyle } from './nomenclature'
import nav from '@/i18n/messages/en/nav'

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

  it('organises the sidebar by stage of the work: four visible groups and System, folded', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(['Work', 'Memory', 'Assistants', 'Code', 'System'])
    expect(NAV_GROUPS.filter((g) => !g.collapsed)).toHaveLength(4)
    expect(NAV_GROUPS.filter((g) => g.collapsed).map((g) => g.id)).toEqual(['system'])
    expect(NAV_GROUPS.find((g) => g.id === 'system')!.items).toContain('neuralRouting')
  })

  it('puts every `software` concept in the Code group and nothing else there', () => {
    const software = Object.entries(NOMENCLATURE)
      .filter(([, c]) => c.profile === 'software')
      .map(([k]) => k)
      .sort()
    const code = NAV_GROUPS.find((g) => g.id === 'code')!
    expect([...code.items].sort()).toEqual(software)
  })

  it('keeps the English translation file in step with the registry (the site copies the registry)', () => {
    for (const g of NAV_GROUPS) expect(nav.groups[g.id], `nav.groups.${g.id}`).toBe(g.label)
    for (const g of NAV_GROUPS) {
      for (const key of g.items) {
        expect(nav.concepts[key as keyof typeof nav.concepts], `nav.concepts.${key}`).toBe(NOMENCLATURE[key].plural)
      }
    }
    expect(nav.workspaces).toBe(NAV_TEXT.workspaces)
    expect(nav.allWorkspaces).toBe(NAV_TEXT.allWorkspaces)
    expect(nav.newWorkspace).toBe(NAV_TEXT.newWorkspace)
    expect(nav.attention.one).toBe(NAV_TEXT.attentionOne)
    expect(nav.attention.many).toBe(NAV_TEXT.attentionMany)
    expect(nav.today.assistants).toBe(TODAY_WORDS.assistants)
    expect(nav.today.bands).toEqual(TODAY_WORDS.bands)
  })

  it('lists every concept that has a page in the sidebar', () => {
    const keys = new Set(NAV_GROUPS.flatMap((g) => g.items))
    // `insights` lives inside a project; `today` and `workspaces` are the application root (global chrome),
    // not entries of a workspace's sidebar.
    for (const key of Object.keys(NOMENCLATURE)) {
      if (key === 'insights' || key === 'today' || key === 'workspaces') continue
      expect(keys.has(key as keyof typeof NOMENCLATURE)).toBe(true)
    }
  })

  it('keeps Today out of a workspace sidebar: it is the root above the workspaces', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items)).not.toContain('today')
  })

  describe('description — the one-liner of every concept (AUDIENCE.md § 2)', () => {
    const BANNED_DESCRIPTION = /\b(agents?|milestones?|rfcs?|mcp|neo4j|graphs?|fsm|louvain|neural|knowledge graph)\b/i
    const entries = Object.entries(NOMENCLATURE)

    it('never uses a word the site bans from the first level', () => {
      for (const [key, c] of entries) {
        const m = c.description.match(BANNED_DESCRIPTION)
        expect(m, `${key}.description contains « ${m?.[0]} »`).toBeNull()
      }
    })

    it('is English, like the rest of the registry (no accented French word)', () => {
      for (const [key, c] of entries) expect(c.description, `${key}.description`).not.toMatch(/[àâéèêëîïôûùüç]/i)
    })

    it('ends with a full stop and fits one line of subtitle', () => {
      for (const [key, c] of entries) {
        expect(c.description, `${key}.description`).toMatch(/\.$/)
        expect(c.description.length, `${key}.description`).toBeLessThanOrEqual(100)
      }
    })
  })

  describe('explain — the three sentences that introduce a screen (AUDIENCE.md § 9)', () => {
    /** Words the site bans from any explanation: technical names and the words the product renamed. */
    const BANNED = /\b(agents?|milestones?|rfcs?|mcp|neo4j|graphs?|fsm|louvain|neural)\b/i
    const LINES = ['what', 'why', 'different'] as const
    const entries = Object.entries(NOMENCLATURE) as [string, (typeof NOMENCLATURE)[keyof typeof NOMENCLATURE]][]

    it('gives every concept three non-empty lines', () => {
      for (const [key, c] of entries) {
        for (const line of LINES) {
          expect(c.explain[line].trim().length, `${key}.explain.${line}`).toBeGreaterThan(0)
        }
      }
    })

    it('uses the product\'s words only: never agent, milestone, RFC, MCP, Neo4j, graph, FSM, Louvain or neural', () => {
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

  describe('tint (the single source of the colour of a kind of thing)', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

    it('gives every concept a 6-digit hex tint', () => {
      for (const [key, c] of Object.entries(NOMENCLATURE)) expect(c.tint, key).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('keeps the kinds of things shown as cards visibly different from one another', () => {
      // RGB distance >= 25: the measured floor of the first palette (proposals and decisions, one family on purpose).
      // A hand-picked colour that lands next to another fails here, before a screen shows two types the same way.
      for (let i = 0; i < CARD_CONCEPTS.length; i++) {
        for (let j = i + 1; j < CARD_CONCEPTS.length; j++) {
          const a = rgb(NOMENCLATURE[CARD_CONCEPTS[i]!].tint)
          const b = rgb(NOMENCLATURE[CARD_CONCEPTS[j]!].tint)
          const d = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
          expect(d, `${CARD_CONCEPTS[i]} / ${CARD_CONCEPTS[j]}`).toBeGreaterThanOrEqual(25)
        }
      }
    })

    it('only lists real concepts as cards, once each', () => {
      expect(new Set(CARD_CONCEPTS).size).toBe(CARD_CONCEPTS.length)
      for (const key of CARD_CONCEPTS) expect(NOMENCLATURE[key]).toBeDefined()
    })

    it('hands the tint to a card as the CSS variable the card recipe reads', () => {
      expect(tintStyle('plans')).toEqual({ '--entity-tint': NOMENCLATURE.plans.tint })
    })
  })
})
