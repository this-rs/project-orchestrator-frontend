import { describe, it, expect } from 'vitest'
import {
  formatRelativeShort,
  formatAbsolute,
  formatDay,
  formatDurationMs,
  formatElapsed,
  formatCost,
  formatCompactNumber,
  pluralize,
  getRecencyGroup,
  groupByRecency,
  groupBy,
} from './format'

const NOW = new Date(2026, 8, 24, 15, 0, 0) // 24 Sep 2026, 15:00 local

const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatRelativeShort', () => {
  it('formats past instants compactly', () => {
    expect(formatRelativeShort(ago(10_000), NOW)).toBe('now')
    expect(formatRelativeShort(ago(5 * MIN), NOW)).toBe('5m')
    expect(formatRelativeShort(ago(3 * HOUR), NOW)).toBe('3h')
    expect(formatRelativeShort(ago(2 * DAY), NOW)).toBe('2d')
    expect(formatRelativeShort(new Date(2026, 8, 12), NOW)).toBe('12 Sep')
    expect(formatRelativeShort(new Date(2025, 8, 12), NOW)).toBe('12 Sep 2025')
  })

  it('handles future dates and invalid input', () => {
    expect(formatRelativeShort(new Date(NOW.getTime() + 5 * MIN), NOW)).toBe('in 5m')
    expect(formatRelativeShort(new Date(NOW.getTime() + 2 * DAY), NOW)).toBe('in 2d')
    expect(formatRelativeShort('not a date', NOW)).toBe('')
  })

  it('accepts ISO strings and epoch ms', () => {
    expect(formatRelativeShort(ago(3 * HOUR).toISOString(), NOW)).toBe('3h')
    expect(formatRelativeShort(ago(3 * HOUR).getTime(), NOW)).toBe('3h')
  })
})

describe('formatAbsolute / formatDay', () => {
  it('formats full and day-only dates', () => {
    expect(formatAbsolute(new Date(2026, 8, 12, 9, 5))).toBe('12 Sep 2026, 09:05')
    expect(formatDay(new Date(2026, 0, 3), NOW)).toBe('3 Jan')
    expect(formatDay(new Date(2024, 0, 3), NOW)).toBe('3 Jan 2024')
    expect(formatAbsolute('nope')).toBe('')
  })
})

describe('durations', () => {
  it('formatDurationMs', () => {
    expect(formatDurationMs(500)).toBe('<1s')
    expect(formatDurationMs(42_000)).toBe('42s')
    expect(formatDurationMs(12 * MIN)).toBe('12m')
    expect(formatDurationMs(65 * MIN)).toBe('1h 5m')
    expect(formatDurationMs(51 * HOUR)).toBe('2d 3h')
    expect(formatDurationMs(-5)).toBe('<1s')
  })

  it('formatElapsed', () => {
    expect(formatElapsed(ago(30_000), NOW)).toBe('<1m')
    expect(formatElapsed(ago(42 * MIN), NOW)).toBe('42m')
    expect(formatElapsed(ago(65 * MIN), NOW)).toBe('1h 5m')
    expect(formatElapsed('bad', NOW)).toBe('')
  })
})

describe('small formatters', () => {
  it('pluralize / cost / compact number', () => {
    expect(pluralize(1, 'task')).toBe('1 task')
    expect(pluralize(3, 'task')).toBe('3 tasks')
    expect(pluralize(2, 'match', 'matches')).toBe('2 matches')
    expect(formatCost(0)).toBeNull()
    expect(formatCost(null)).toBeNull()
    expect(formatCost(0.4199)).toBe('$0.42')
    expect(formatCompactNumber(950)).toBe('950')
    expect(formatCompactNumber(1240)).toBe('1.2k')
    expect(formatCompactNumber(3_400_000)).toBe('3.4M')
  })
})

describe('recency grouping', () => {
  it('buckets by calendar day', () => {
    expect(getRecencyGroup(new Date(2026, 8, 24, 0, 1), NOW)).toBe('Today')
    expect(getRecencyGroup(new Date(2026, 8, 23, 23, 59), NOW)).toBe('Yesterday')
    expect(getRecencyGroup(new Date(2026, 8, 20), NOW)).toBe('Previous 7 days')
    expect(getRecencyGroup(new Date(2026, 8, 1), NOW)).toBe('Previous 30 days')
    expect(getRecencyGroup(new Date(2026, 1, 1), NOW)).toBe('Older')
    expect(getRecencyGroup(new Date(2027, 1, 1), NOW)).toBe('Today')
    expect(getRecencyGroup('garbage', NOW)).toBe('Older')
  })

  it('groups items in canonical order, preserving order inside groups', () => {
    const items = [
      { id: 'a', d: new Date(2026, 1, 1) },
      { id: 'b', d: new Date(2026, 8, 24, 10) },
      { id: 'c', d: new Date(2026, 8, 24, 9) },
      { id: 'd', d: null },
      { id: 'e', d: new Date(2026, 8, 23, 9) },
    ]
    const groups = groupByRecency(items, (i) => i.d, NOW)
    expect(groups.map((g) => g.group)).toEqual(['Today', 'Yesterday', 'Older'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'c'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['a', 'd'])
  })

  it('groupBy honours an explicit order and appends unknown keys', () => {
    const items = [
      { s: 'done' },
      { s: 'todo' },
      { s: 'weird' },
      { s: 'todo' },
    ]
    const groups = groupBy(items, (i) => i.s, ['todo', 'doing', 'done'])
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['todo', 2],
      ['done', 1],
      ['weird', 1],
    ])
  })
})
