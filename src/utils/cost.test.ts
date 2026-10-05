/**
 * A cost travels with its basis, and an unknown cost is never "$0".
 *
 * Run with: npx vitest run src/utils/cost.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  costFromResult,
  costOfMessage,
  costReport,
  costToText,
  describeCost,
  formatCostSum,
  formatTokens,
  formatUsd,
  sumCosts,
} from './cost'
import {
  CLAUDE_RESULT,
  FREE_RESULT,
  PRICED_RESULT,
  UNKNOWN_COST_RESULT,
} from './__fixtures__/providerEventFrames'

describe('costFromResult', () => {
  it('a bare cost_usd is a reported cost', () => {
    expect(costFromResult(CLAUDE_RESULT)).toEqual({ usd: 0.0123, basis: 'reported' })
  })

  it('`cost` wins over `cost_usd`', () => {
    expect(costFromResult(PRICED_RESULT)).toEqual({
      usd: 0.042,
      basis: 'priced',
      tokens: { input: 5000, output: 800 },
    })
  })

  it('a free turn has no figure, and its tokens', () => {
    expect(costFromResult(FREE_RESULT)).toEqual({ usd: null, basis: 'free', tokens: { input: 1200, output: 300 } })
  })

  it('an unknown cost stays unknown — `cost_usd: null` is not zero', () => {
    expect(costFromResult(UNKNOWN_COST_RESULT)).toEqual({ usd: null, basis: 'unknown' })
  })

  it('a result that says nothing about cost gives nothing', () => {
    expect(costFromResult({ type: 'result', duration_ms: 3 })).toBeNull()
    expect(costFromResult({ type: 'result', cost_usd: null })).toBeNull()
  })

  it('a `cost` with an unreadable basis is unknown, not reported', () => {
    expect(costFromResult({ cost: { usd: 1, basis: 'guessed' } })).toEqual({ usd: 1, basis: 'unknown' })
  })

  it('reads the PascalCase basis the backend may send', () => {
    expect(costFromResult({ cost: { usd: null, basis: 'Free' } })?.basis).toBe('free')
  })
})

describe('costReport (REST records: figure + optional basis)', () => {
  it('a figure alone is reported — what a pre-provider backend sends', () => {
    expect(costReport(1.5)).toEqual({ usd: 1.5, basis: 'reported' })
  })
  it('a basis is believed even without a figure', () => {
    expect(costReport(null, 'unknown')).toEqual({ usd: null, basis: 'unknown' })
    expect(costReport(undefined, 'free')).toEqual({ usd: null, basis: 'free' })
  })
  it('nothing said, nothing reported', () => {
    expect(costReport(null)).toBeNull()
    expect(costReport(undefined, null)).toBeNull()
  })
})

describe('describeCost', () => {
  it('reported: the amount, with the format a turn always had', () => {
    expect(describeCost({ usd: 0.0042, basis: 'reported' })).toMatchObject({ text: '$0.0042', estimated: false, help: null })
    expect(describeCost({ usd: 0.0123, basis: 'reported' }).text).toBe('$0.01')
    expect(describeCost({ usd: 1.234, basis: 'reported' }).text).toBe('$1.23')
    expect(formatUsd(0.5)).toBe('$0.50')
  })

  it('priced: the amount, flagged as an estimate, with an explanation', () => {
    const d = describeCost({ usd: 0.042, basis: 'priced' })
    expect(d.text).toBe('$0.04')
    expect(d.estimated).toBe(true)
    expect(d.help).toMatch(/price table/)
    expect(costToText({ usd: 0.042, basis: 'priced' })).toBe('$0.04 est.')
  })

  it('free: "local", never an ambiguous $0.00 — even when the server sent a zero', () => {
    expect(describeCost({ usd: 0, basis: 'free' }).text).toBe('local')
    expect(describeCost({ usd: null, basis: 'free' }).text).toBe('local')
  })

  it('subscription: the word, and the notional amount only in the explanation', () => {
    const d = describeCost({ usd: 0.3, basis: 'subscription' })
    expect(d.text).toBe('subscription')
    expect(d.help).toContain('$0.30')
    expect(describeCost({ basis: 'subscription' }).help).not.toContain('$')
  })

  it.each([
    [{ usd: null, basis: 'unknown' as const }],
    [{ basis: 'unknown' as const }],
    [{ usd: 0, basis: 'unknown' as const }],
    [{ usd: null, basis: 'reported' as const }],
    [{ usd: null, basis: 'priced' as const }],
  ])('unknown or no figure (%j): never "$0", nothing without tokens', (report) => {
    const d = describeCost(report)
    expect(d.text).toBeNull()
    expect(costToText(report)).toBeNull()
  })

  it('unknown with tokens: the tokens alone', () => {
    expect(describeCost({ usd: null, basis: 'unknown', tokens: { input: 1200, output: 300 } }).text).toBe('1.2k in · 300 out')
    expect(formatTokens({ output: 5 })).toBe('5 out')
    expect(formatTokens({ cache_read: 5 })).toBeNull()
  })

  it('hideZero hides a reported zero only', () => {
    expect(describeCost({ usd: 0, basis: 'reported' }, { hideZero: true }).text).toBeNull()
    expect(describeCost({ usd: 0, basis: 'reported' }).text).toBe('$0.0000')
  })

  it('nothing said → nothing shown', () => {
    expect(describeCost(null).text).toBeNull()
  })
})

describe('costOfMessage', () => {
  it('a message with a bare cost_usd (built before bases existed) is a reported cost', () => {
    expect(costOfMessage({ cost_usd: 0.02 })).toEqual({ usd: 0.02, basis: 'reported' })
  })
  it('a message without any cost has none', () => {
    expect(costOfMessage({})).toBeNull()
  })
})

describe('sumCosts / formatCostSum', () => {
  it('all known: an exact total', () => {
    const sum = sumCosts([costReport(1), costReport(0.5), { usd: null, basis: 'free' }])
    expect(sum).toEqual({ usd: 1.5, known: 3, unknown: 0, estimated: false })
    expect(formatCostSum(sum)).toBe('$1.50')
  })

  it('known and unknown mixed: a floor, shown as "≥"', () => {
    const sum = sumCosts([costReport(1), { usd: null, basis: 'unknown' }, costReport(0.25, 'priced')])
    expect(sum.unknown).toBe(1)
    expect(sum.estimated).toBe(true)
    expect(formatCostSum(sum)).toBe('≥ $1.25')
  })

  it('a record that says nothing about its cost makes the total a floor too', () => {
    expect(formatCostSum(sumCosts([costReport(2), null]))).toBe('≥ $2.00')
  })

  it('nothing known: no total at all, not $0.00', () => {
    expect(formatCostSum(sumCosts([{ usd: null, basis: 'unknown' }, null]))).toBeNull()
    expect(sumCosts([{ usd: null, basis: 'unknown' }, null]).unknown).toBe(2)
    expect(formatCostSum(sumCosts([]))).toBeNull()
  })
})
