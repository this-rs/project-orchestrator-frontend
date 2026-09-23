/**
 * Tests for the model presentation helpers.
 *
 * Run with: npx vitest run src/constants/models.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  compareVersions,
  defaultModelForFamily,
  getFamilyDotColor,
  getModelShortLabel,
  groupModelsByFamily,
  parseModelFamily,
  sortByVersionAscending,
  type ModelDefinition,
} from './models'

function model(id: string, family: ModelDefinition['family'], version: string, tier: ModelDefinition['tier']): ModelDefinition {
  return { id, family, version, tier, shortLabel: '', fullLabel: '', description: '' }
}

const OPUS: ModelDefinition[] = [
  model('claude-opus-5-5', 'opus', '5.5', 'current'),
  model('claude-opus-5', 'opus', '5', 'legacy'),
  model('claude-opus-4-8', 'opus', '4.8', 'legacy'),
  model('claude-opus-4-7', 'opus', '4.7', 'legacy'),
  model('claude-opus-4-6', 'opus', '4.6', 'legacy'),
]

describe('compareVersions', () => {
  it('compares segment by segment, numerically', () => {
    expect(compareVersions('5.5', '5')).toBeGreaterThan(0)
    expect(compareVersions('4.8', '5')).toBeLessThan(0)
    expect(compareVersions('5', '5.0')).toBe(0)
  })

  it('is numeric, not lexicographic', () => {
    // A string sort would put "4.10" before "4.9".
    expect(compareVersions('4.10', '4.9')).toBeGreaterThan(0)
  })
})

describe('sortByVersionAscending', () => {
  it('orders oldest to newest regardless of backend order', () => {
    expect(sortByVersionAscending(OPUS).map((m) => m.version)).toEqual(['4.6', '4.7', '4.8', '5', '5.5'])
  })

  it('does not mutate its input', () => {
    const input = [...OPUS]
    sortByVersionAscending(input)
    expect(input.map((m) => m.version)).toEqual(OPUS.map((m) => m.version))
  })
})

describe('defaultModelForFamily', () => {
  it('shows the active model when it belongs to the family', () => {
    expect(defaultModelForFamily(OPUS, 'claude-opus-4-7')?.id).toBe('claude-opus-4-7')
  })

  it('falls back to the current-lineup model when the active one is elsewhere', () => {
    expect(defaultModelForFamily(OPUS, 'claude-sonnet-5')?.id).toBe('claude-opus-5-5')
  })

  it('falls back to the newest version when the family has no current model', () => {
    const legacyOnly = OPUS.filter((m) => m.tier === 'legacy')
    expect(defaultModelForFamily(legacyOnly, 'claude-sonnet-5')?.id).toBe('claude-opus-5')
  })

  it('returns undefined for an empty family', () => {
    expect(defaultModelForFamily([], 'claude-opus-5-5')).toBeUndefined()
  })
})

describe('groupModelsByFamily', () => {
  it('puts every model under its family and carries a dot color', () => {
    const groups = groupModelsByFamily([...OPUS, model('claude-haiku-4-5', 'haiku', '4.5', 'current')])
    expect(groups.map((g) => g.family)).toEqual(['opus', 'haiku'])
    expect(groups[0].models).toHaveLength(5)
    for (const g of groups) expect(g.dotColor).toMatch(/^bg-/)
  })

  it('files an unknown family under "other" instead of dropping it', () => {
    const groups = groupModelsByFamily([
      { ...model('claude-nova-1', 'opus', '1', 'current'), family: 'nova' as ModelDefinition['family'] },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].family).toBe('other')
  })
})

describe('bare-ID fallbacks', () => {
  it('derives family, color and label from an ID alone', () => {
    expect(parseModelFamily('claude-fable-5-1')).toBe('fable')
    expect(getFamilyDotColor('fable')).toBe('bg-rose-500')
    expect(getModelShortLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(getModelShortLabel('claude-sonnet-5')).toBe('Sonnet 5')
  })
})
