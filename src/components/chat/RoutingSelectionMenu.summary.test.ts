/**
 * Which line the routing menu shows for a pool of several models.
 *
 * The label is not cosmetic: a pool ticked across two providers or more may move
 * the conversation to the other provider (R-S2), and a pool on a single provider
 * does not. The menu used to say the same thing in both cases.
 *
 * Run with: npx vitest run src/components/chat/RoutingSelectionMenu.summary.test.ts
 */
import { describe, it, expect } from 'vitest'
import { summaryMixedKey } from './RoutingSelectionMenu'

describe('the several-models line of the routing menu', () => {
  it('announces that the provider may change when the pool spans providers', () => {
    expect(summaryMixedKey(2)).toBe('routing.menu.summaryMixedCrossProvider')
    expect(summaryMixedKey(3)).toBe('routing.menu.summaryMixedCrossProvider')
  })

  it('keeps the plain wording when every ticked model lives on one provider', () => {
    expect(summaryMixedKey(1)).toBe('routing.menu.summaryMixed')
    expect(summaryMixedKey(0)).toBe('routing.menu.summaryMixed')
  })
})
