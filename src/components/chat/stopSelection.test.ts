import { describe, expect, it } from 'vitest'
import type { RunningItem } from './runningActivity'
import { RECENT_THRESHOLD_MS, ageMs, groupOf, keepGroup, onlyOld, planStop, runPool, selectAll } from './stopSelection'

const NOW = Date.parse('2026-01-01T12:00:00Z')
const at = (ms: number) => new Date(NOW - ms).toISOString()
const items: RunningItem[] = [
  { id: 'old', kind: 'shell', title: 'old', startedAt: at(RECENT_THRESHOLD_MS), taskId: 't1' },
  { id: 'new', kind: 'shell', title: 'new', startedAt: at(RECENT_THRESHOLD_MS - 1), taskId: 't2' },
  { id: 'unknown', kind: 'monitor', title: 'unknown', taskId: 't3' },
  { id: 'agent', kind: 'agent', title: 'agent', startedAt: at(99 * 60_000) },
  { id: 'ro', kind: 'run', title: 'ro', sessionId: 'c', readOnly: true, taskId: 't4' },
]

describe('stopSelection', () => {
  it('groups kinds', () => {
    expect(items.map(groupOf)).toEqual(['background', 'background', 'monitor', 'agent', 'other'])
    expect(groupOf({ id: 'w', kind: 'workflow', title: 'w' })).toBe('agent')
  })
  it('ages, and an invalid or missing start is unknown', () => {
    expect(ageMs(items[0], NOW)).toBe(RECENT_THRESHOLD_MS)
    expect(ageMs(items[2], NOW)).toBeUndefined()
    expect(ageMs({ id: 'x', kind: 'shell', title: 'x', startedAt: 'nope' }, NOW)).toBeUndefined()
    expect(ageMs({ id: 'x', kind: 'shell', title: 'x', startedAt: at(-5000) }, NOW)).toBe(0)
  })
  it('only the old ones keeps the threshold inclusive and leaves the unknown alone', () => {
    expect([...onlyOld(items, selectAll(items), NOW)].sort()).toEqual(['agent', 'old'])
  })
  it('keepGroup unticks one group only', () => {
    expect([...keepGroup(items, selectAll(items), 'background')].sort()).toEqual(['agent', 'ro', 'unknown'])
  })
  it('plans: everything → all; otherwise only targetable, non read-only rows', () => {
    expect(planStop(items, selectAll(items)).mode).toBe('all')
    expect(planStop([], new Set()).mode).toBe('all')
    const plan = planStop(items, new Set(['old', 'agent', 'ro']))
    expect(plan.mode).toBe('partial')
    expect(plan.targets.map((i) => i.id)).toEqual(['old'])
    expect(plan.untargetable.map((i) => i.id)).toEqual(['agent', 'ro'])
  })
  it('runPool never exceeds the limit and visits each once', async () => {
    let live = 0; let max = 0; const seen: number[] = []
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { live++; max = Math.max(max, live); await Promise.resolve(); seen.push(n); live-- })
    expect(max).toBe(3); expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})
