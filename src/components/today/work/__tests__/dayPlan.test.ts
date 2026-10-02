import { describe, expect, it } from 'vitest'
import {
  DAY_PLAN_KEY,
  addToDay,
  dayKey,
  emptyDayPlan,
  isDoneToday,
  loadDayPlan,
  moveInDay,
  removeFromDay,
  saveDayPlan,
} from '../dayPlan'

const NOON = new Date(2026, 9, 2, 12, 0, 0) // 2 Oct 2026, local

function store(initial?: string) {
  let v = initial
  return {
    getItem: (k: string) => (k === DAY_PLAN_KEY ? (v ?? null) : null),
    setItem: (k: string, val: string) => {
      if (k === DAY_PLAN_KEY) v = val
    },
    read: () => v,
  }
}

describe('dayKey', () => {
  it('is the local calendar day, zero padded', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(dayKey(NOON)).toBe('2026-10-02')
  })
})

describe('load / save', () => {
  it('round-trips the ids in order', () => {
    const s = store()
    saveDayPlan(s, { date: '2026-10-02', ids: ['b', 'a'] })
    expect(loadDayPlan(s, NOON).ids).toEqual(['b', 'a'])
  })

  it('carries unfinished ids over to a new day and stamps the new date', () => {
    const s = store(JSON.stringify({ date: '2026-10-01', ids: ['a', 'b'] }))
    expect(loadDayPlan(s, NOON)).toEqual({ date: '2026-10-02', ids: ['a', 'b'] })
  })

  it.each([
    ['not json', '{nope'],
    ['wrong shape', JSON.stringify({ ids: 'a' })],
    ['non-string ids', JSON.stringify({ date: 'x', ids: [1, 2] })],
  ])('treats %s as an empty plan, never throws', (_n, raw) => {
    expect(loadDayPlan(store(raw), NOON)).toEqual(emptyDayPlan(NOON))
  })

  it('works without any storage (private mode)', () => {
    expect(loadDayPlan(null, NOON)).toEqual(emptyDayPlan(NOON))
    expect(() => saveDayPlan(null, emptyDayPlan(NOON))).not.toThrow()
  })

  it('drops duplicate ids from a stored plan', () => {
    const s = store(JSON.stringify({ date: '2026-10-02', ids: ['a', 'a', 'b'] }))
    expect(loadDayPlan(s, NOON).ids).toEqual(['a', 'b'])
  })
})

describe('editing', () => {
  const base = { date: '2026-10-02', ids: ['a', 'b', 'c'] }

  it('adds once, at the end', () => {
    expect(addToDay(base, 'd').ids).toEqual(['a', 'b', 'c', 'd'])
    expect(addToDay(base, 'b')).toBe(base)
  })

  it('removes, and leaves the plan untouched for an unknown id', () => {
    expect(removeFromDay(base, 'b').ids).toEqual(['a', 'c'])
    expect(removeFromDay(base, 'zzz')).toBe(base)
  })

  it('moves one place and ignores moves off either end', () => {
    expect(moveInDay(base, 'b', -1).ids).toEqual(['b', 'a', 'c'])
    expect(moveInDay(base, 'b', 1).ids).toEqual(['a', 'c', 'b'])
    expect(moveInDay(base, 'a', -1)).toBe(base)
    expect(moveInDay(base, 'c', 1)).toBe(base)
    expect(moveInDay(base, 'zzz', 1)).toBe(base)
  })
})

describe('isDoneToday', () => {
  it('is true only for a completion on the same local day', () => {
    expect(isDoneToday(new Date(2026, 9, 2, 8).toISOString(), NOON)).toBe(true)
    expect(isDoneToday(new Date(2026, 9, 1, 23).toISOString(), NOON)).toBe(false)
    expect(isDoneToday(undefined, NOON)).toBe(false)
    expect(isDoneToday('garbage', NOON)).toBe(false)
  })
})
