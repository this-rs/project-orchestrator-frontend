import { describe, expect, it } from 'vitest'
import { finite, fmt, fmtPct, MISSING } from './fmt'

describe('fmt', () => {
  it('formats a finite number with its digits and scale', () => {
    expect(fmt(0.12345, 3)).toBe('0.123')
    expect(fmt(0.5, 0, 100)).toBe('50')
    expect(fmt(0, 2)).toBe('0.00')
  })
  it('shows "—" for what is not a number we have, never a plausible 0', () => {
    for (const n of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(fmt(n, 2)).toBe(MISSING)
      expect(fmt(n, 0, 100)).toBe(MISSING)
      expect(fmtPct(n)).toBe(MISSING)
      expect(finite(n)).toBeNull()
    }
  })
  it('a ratio as a percentage', () => {
    expect(fmtPct(0.421)).toBe('42%')
    expect(fmtPct(0.4215, 1)).toBe('42.1%')
    expect(finite(0)).toBe(0)
  })
})
