import { describe, it, expect } from 'vitest'
import {
  LINK_FAMILY_ALPHA,
  linkFamilyOf,
  linkFamilyAlpha,
  computeLinkAlpha,
  LINK_ALPHA_FLOOR,
} from './linkFamily'

// The previous budget (before the ≈ ×0.7 cut), kept as anchors for the review.
const PREVIOUS: Record<string, number> = {
  IMPORTS: 0.15, CALLS: 0.13, EXTENDS: 0.17, IMPLEMENTS: 0.15, CONTAINS: 0.13,
  HAS_TASK: 0.13, HAS_STEP: 0.11, HAS_DECISION: 0.11,
  TOUCHES: 0.05, CO_CHANGED: 0.055, CO_CHANGED_TRANSITIVE: 0.04,
  DISCUSSED: 0.07, AFFECTS: 0.08, SYNAPSE: 0.07, AGGREGATE: 0.1,
}

describe('LINK_FAMILY_ALPHA — the named, documented link opacity table', () => {
  it('orders the three families strictly: structure > knowledge > tissue', () => {
    const structure = ['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'CONTAINS', 'HAS_TASK', 'HAS_STEP', 'HAS_DECISION']
    const knowledge = ['DISCUSSED', 'AFFECTS', 'SYNAPSE']
    const tissue = ['CO_CHANGED', 'TOUCHES', 'CO_CHANGED_TRANSITIVE']
    for (const s of structure) {
      for (const k of knowledge) expect(LINK_FAMILY_ALPHA[s]).toBeGreaterThan(LINK_FAMILY_ALPHA[k])
      for (const t of tissue) expect(LINK_FAMILY_ALPHA[s]).toBeGreaterThan(LINK_FAMILY_ALPHA[t])
    }
    for (const k of knowledge) for (const t of tissue) expect(LINK_FAMILY_ALPHA[k]).toBeGreaterThan(LINK_FAMILY_ALPHA[t])
  })

  it('cuts every previous value by ≈ ×0.7 while keeping it above the floor', () => {
    for (const [type, prev] of Object.entries(PREVIOUS)) {
      const next = LINK_FAMILY_ALPHA[type]
      expect(next).toBeLessThanOrEqual(prev * 0.7 + 0.001)
      expect(next).toBeGreaterThanOrEqual(prev * 0.7 - 0.001)
    }
  })

  it('classifies every type into the family its budget belongs to', () => {
    expect(linkFamilyOf('IMPORTS')).toBe('structure')
    expect(linkFamilyOf('CALLS')).toBe('structure')
    expect(linkFamilyOf('HAS_STATE')).toBe('structure') // HAS_* wildcard
    expect(linkFamilyOf('DISCUSSED')).toBe('knowledge')
    expect(linkFamilyOf('AFFECTS')).toBe('knowledge')
    expect(linkFamilyOf('CO_CHANGED')).toBe('tissue')
    expect(linkFamilyOf('TOUCHES')).toBe('tissue')
    expect(linkFamilyOf('SOMETHING_NEW')).toBe('tissue') // unknown recedes like tissue
  })

  it('resolves an unknown type to the tissue budget, never to nothing', () => {
    expect(linkFamilyAlpha('SOMETHING_NEW')).toBe(LINK_FAMILY_ALPHA.TOUCHES)
    expect(linkFamilyAlpha('SOMETHING_NEW')).toBeGreaterThan(0)
  })
})

describe('computeLinkAlpha — the resting web fades, a focused link never does', () => {
  const base = { weight: 0.5, colorAlpha: 1, linkCount: 2000, isInterCommunity: false, emphasised: false }

  it('keeps a focused (hovered / selected / activated) link stronger than its resting twin', () => {
    const resting = computeLinkAlpha({ ...base, familyAlpha: 0.05 })
    const focused = computeLinkAlpha({ ...base, familyAlpha: 0.05, emphasised: true })
    expect(focused).toBeGreaterThan(resting)
    // a focused link also skips the density ceiling, so even a dense graph cannot dim it
    const denseResting = computeLinkAlpha({ ...base, familyAlpha: 0.05, linkCount: 100000 })
    const denseFocused = computeLinkAlpha({ ...base, familyAlpha: 0.05, linkCount: 100000, emphasised: true })
    expect(denseFocused).toBeGreaterThan(denseResting)
  })

  it('never drops below the floor, scaled by the colour alpha', () => {
    expect(computeLinkAlpha({ ...base, familyAlpha: 0.001, weight: 0 })).toBeGreaterThanOrEqual(LINK_ALPHA_FLOOR)
    const dim = computeLinkAlpha({ ...base, familyAlpha: 0.001, weight: 0, colorAlpha: 0.5 })
    expect(dim).toBeGreaterThanOrEqual(LINK_ALPHA_FLOOR * 0.5)
  })

  it('orders the families for identical inputs (structure > knowledge > tissue)', () => {
    // A focused link skips the density fade, so the family alpha is the only
    // difference left — and it must stay ordered. The resting web can plateau
    // at the floor (that is its point: tissue recedes into the background).
    const mk = (familyAlpha: number) => computeLinkAlpha({ ...base, familyAlpha, emphasised: true, weight: 1 })
    expect(mk(LINK_FAMILY_ALPHA.EXTENDS)).toBeGreaterThan(mk(LINK_FAMILY_ALPHA.AFFECTS))
    expect(mk(LINK_FAMILY_ALPHA.AFFECTS)).toBeGreaterThan(mk(LINK_FAMILY_ALPHA.TOUCHES))
  })

  it('is monotone non-decreasing in the family alpha (the floor may plateau)', () => {
    const fams = [0.028, 0.035, 0.049, 0.056, 0.077, 0.105, 0.119]
    const as = fams.map((familyAlpha) => computeLinkAlpha({ ...base, familyAlpha }))
    for (let i = 1; i < as.length; i++) expect(as[i]).toBeGreaterThanOrEqual(as[i - 1])
  })
})
