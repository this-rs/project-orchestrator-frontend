import { describe, expect, it } from 'vitest'
import { layoutGantt, GAP_MS } from './gantt'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000

function item(id: string, over: Partial<TimelineItem> = {}): TimelineItem {
  return { id, kind: 'tool', status: 'done', label: id, startedAt: T0, laneId: 'l', ...over }
}
const lane = (items: TimelineItem[]): TimelineLane => ({ id: 'l', title: 'Conversation', items })

describe('layoutGantt', () => {
  it('has nothing to say about an empty conversation', () => {
    const l = layoutGantt([lane([])], T0)
    expect(l.count).toBe(0)
    expect(l.sections).toEqual([])
  })

  it('places overlapping calls side by side on one axis and counts the peak', () => {
    const l = layoutGantt([lane([
      item('a', { startedAt: T0, endedAt: T0 + 4000 }),
      item('b', { startedAt: T0 + 1000, endedAt: T0 + 3000 }),
      item('c', { startedAt: T0 + 1500, endedAt: T0 + 2500 }),
    ])], T0 + 5000)
    const [a, b, c] = l.sections[0]!.rows
    expect(a!.leftPct).toBe(0)
    expect(a!.widthPct).toBeCloseTo(100)
    expect(b!.leftPct).toBeCloseTo(25)
    expect(b!.widthPct).toBeCloseTo(50)
    expect(c!.leftPct).toBeCloseTo(37.5)
    expect(l.peak).toBe(3)
    expect(l.concurrency.some((s) => s.n === 3)).toBe(true)
  })

  it('draws a call still running up to now', () => {
    const l = layoutGantt([lane([item('a', { status: 'running', startedAt: T0 }), item('b', { startedAt: T0, endedAt: T0 + 1000 })])], T0 + 2000)
    const a = l.sections[0]!.rows[0]!
    expect(a.end).toBe(T0 + 2000)
    expect(a.instant).toBe(false)
    expect(a.widthPct).toBeCloseTo(100)
  })

  it('treats a call with no known end as a moment, not as a stretch', () => {
    const l = layoutGantt([lane([item('a', { status: 'unknown' }), item('b', { startedAt: T0 + 2000, endedAt: T0 + 3000 })])], T0 + 9000)
    expect(l.sections[0]!.rows[0]!.instant).toBe(true)
    expect(l.peak).toBe(1)
  })

  it('cuts a long silence and says how long it was, so the calls after it stay readable', () => {
    const hour = 3_600_000
    const l = layoutGantt([lane([
      item('a', { startedAt: T0, endedAt: T0 + 2000 }),
      item('b', { startedAt: T0 + hour, endedAt: T0 + hour + 2000 }),
    ])], T0 + hour + 5000)
    const [a, b] = l.sections[0]!.rows
    expect(l.breaks).toHaveLength(1)
    expect(l.breaks[0]!.ms).toBe(hour - 2000)
    // Without the cut `a` would be 0.05 % wide.
    expect(a!.widthPct).toBeGreaterThan(20)
    expect(b!.leftPct).toBeGreaterThan(a!.leftPct + a!.widthPct)
    expect(b!.leftPct + b!.widthPct).toBeLessThanOrEqual(100.0001)
  })

  it('does not stretch the axis over the hours a permission stayed unanswered', () => {
    const hour = 3_600_000
    const l = layoutGantt([lane([
      item('a', { startedAt: T0, endedAt: T0 + 2000 }),
      item('wait', { kind: 'permission', status: 'blocked', startedAt: T0 + 1000, endedAt: undefined }),
      item('b', { startedAt: T0 + hour, endedAt: T0 + hour + 2000 }),
    ])], T0 + hour + 5000)
    expect(l.breaks).toHaveLength(1)
    expect(l.sections[0]!.rows[0]!.widthPct).toBeGreaterThan(20)
  })

  it('keeps a short pause linear', () => {
    const l = layoutGantt([lane([
      item('a', { startedAt: T0, endedAt: T0 + 1000 }),
      item('b', { startedAt: T0 + GAP_MS, endedAt: T0 + GAP_MS + 1000 }),
    ])], T0 + GAP_MS + 2000)
    expect(l.breaks).toHaveLength(0)
  })

  it('indents what hangs below a parent, within a cap', () => {
    const l = layoutGantt([lane([
      item('req', { kind: 'request', startedAt: T0 }),
      item('agent', { kind: 'agent', parentId: 'req', startedAt: T0 + 1, endedAt: T0 + 900 }),
      item('inner', { parentId: 'agent', startedAt: T0 + 2, endedAt: T0 + 800 }),
    ])], T0 + 1000)
    expect(l.sections[0]!.rows.map((r) => r.depth)).toEqual([0, 1, 2])
  })

  it('does not loop on a parent cycle', () => {
    const l = layoutGantt([lane([item('a', { parentId: 'b' }), item('b', { parentId: 'a', startedAt: T0 + 1 })])], T0 + 10)
    expect(l.count).toBe(2)
  })

  it('labels ticks with the real time since the first event, even after a cut', () => {
    const hour = 3_600_000
    const l = layoutGantt([lane([
      item('a', { startedAt: T0, endedAt: T0 + 2000 }),
      item('b', { startedAt: T0 + hour, endedAt: T0 + hour + 2000 }),
    ])], T0 + hour + 3000)
    expect(l.ticks[0]!.offsetMs).toBe(0)
    expect(l.ticks.some((t) => t.offsetMs === hour)).toBe(true)
  })
})
