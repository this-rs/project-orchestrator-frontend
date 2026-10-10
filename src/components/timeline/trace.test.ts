import { describe, expect, it } from 'vitest'
import type { TimelineItem, TimelineLane } from './model'
import { ancestorsOf, buildTraceTree, laneKey, selfTime, unionLength, visibleRows } from './trace'

const T0 = 1_700_000_000_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({ id, kind: 'tool', status: 'done', label: id, startedAt: T0, laneId: 'l', ...over })
const lane = (items: TimelineItem[], over: Partial<TimelineLane> = {}): TimelineLane => ({ id: 'l', title: 'Conversation', items, ...over })

describe('self time', () => {
  it('counts overlapping children once', () => {
    expect(unionLength([[0, 10], [5, 15], [20, 25]])).toBe(20)
    expect(unionLength([])).toBe(0)
  })

  it('is the part of a parent no child covers, children clipped to the parent', () => {
    expect(selfTime(0, 100, [[10, 30], [20, 40], [90, 150]])).toBe(100 - 30 - 10)
    expect(selfTime(0, 100, [])).toBe(100)
  })
})

describe('buildTraceTree', () => {
  // A turn → a sub-agent → its two calls (one running), and a call of the turn itself.
  const lanes = [lane([
    item('req', { kind: 'request', startedAt: T0, endedAt: T0 + 1000 }),
    item('agent', { kind: 'agent', parentId: 'req', startedAt: T0 + 100, endedAt: T0 + 4000 }),
    item('grep', { parentId: 'agent', startedAt: T0 + 200, endedAt: T0 + 1200 }),
    item('read', { parentId: 'agent', status: 'running', startedAt: T0 + 3000 }),
    item('bash', { parentId: 'req', startedAt: T0 + 50, endedAt: T0 + 90 }),
  ])]
  const now = T0 + 5000

  it('nests turn → sub-agent → its calls under the lane, children in time order', () => {
    const tree = buildTraceTree(lanes, now)
    expect(tree.roots).toEqual([laneKey('l')])
    expect(tree.nodes.get('req')!.children).toEqual(['bash', 'agent'])
    expect(tree.nodes.get('agent')!.children).toEqual(['grep', 'read'])
    expect(visibleRows(tree, new Set()).map((r) => [r.key, r.depth])).toEqual([
      [laneKey('l'), 0], ['req', 1], ['bash', 2], ['agent', 2], ['grep', 3], ['read', 3],
    ])
    expect(tree.spanCount).toBe(5)
  })

  it('stretches a parent over what it caused, and a running child to now', () => {
    const tree = buildTraceTree(lanes, now)
    expect(tree.nodes.get('read')!.end).toBe(now)
    expect(tree.nodes.get('agent')!.end).toBe(now)
    // The turn said it ended at +1 s, but its sub-agent runs on: the turn lasts until now.
    expect(tree.nodes.get('req')!.totalMs).toBe(5000)
    expect(tree.nodes.get('req')!.running).toBe(true)
    expect(tree.nodes.get(laneKey('l'))!.running).toBe(true)
  })

  it('gives each parent its self time: total minus what its children cover', () => {
    const tree = buildTraceTree(lanes, now)
    const agent = tree.nodes.get('agent')!
    // 100 → 5000 = 4900 ms; grep covers 1000, read covers 2000.
    expect(agent.totalMs).toBe(4900)
    expect(agent.selfMs).toBe(4900 - 1000 - 2000)
    expect(tree.nodes.get('grep')!.selfMs).toBe(1000)
  })

  it('hides what hangs below a folded row, and knows the way back up', () => {
    const tree = buildTraceTree(lanes, now)
    expect(visibleRows(tree, new Set(['agent'])).map((r) => r.key)).toEqual([laneKey('l'), 'req', 'bash', 'agent'])
    expect(ancestorsOf(tree, 'read')).toEqual(['agent', 'req', laneKey('l')])
  })

  it('puts a child session lane below its parent lane, with its own span', () => {
    const tree = buildTraceTree([
      lane([item('req', { kind: 'request' })], { id: 'root' }),
      lane([item('c1', { laneId: 'child', startedAt: T0 + 10, endedAt: T0 + 20 })], {
        id: 'child', parentLaneId: 'root', relation: 'child',
        span: item('session:child', { kind: 'run', laneId: 'child', startedAt: T0 + 5, endedAt: T0 + 30 }),
      }),
    ], now)
    expect(tree.roots).toEqual([laneKey('root')])
    expect(tree.nodes.get(laneKey('root'))!.children).toContain(laneKey('child'))
    const child = tree.nodes.get(laneKey('child'))!
    expect(child.depth).toBe(1)
    expect(child.start).toBe(T0 + 5)
    expect(child.end).toBe(T0 + 30)
    expect(tree.nodes.get('c1')!.depth).toBe(2)
  })

  it('keeps an undated row (a plan) without a bar and out of the axis', () => {
    const tree = buildTraceTree([lane([item('plan', { kind: 'plan', startedAt: 0 }), item('a', { endedAt: T0 + 10 })])], now)
    expect(tree.nodes.get('plan')!.start).toBeUndefined()
    expect(tree.intervals.every(([a]) => a > 0)).toBe(true)
  })

  it('does not count the hours a permission waits as activity on the axis', () => {
    const tree = buildTraceTree([lane([item('wait', { kind: 'permission', status: 'blocked', startedAt: T0 })])], T0 + 3_600_000)
    expect(tree.intervals).toEqual([[T0, T0]])
    expect(tree.nodes.get('wait')!.end).toBe(T0 + 3_600_000)
  })

  it('survives parent cycles and a parent in another lane', () => {
    const tree = buildTraceTree([
      lane([item('a', { parentId: 'b' }), item('b', { parentId: 'a', startedAt: T0 + 1 }), item('x', { parentId: 'elsewhere' })]),
      lane([], { id: 'l2', parentLaneId: 'l' }),
      lane([], { id: 'l3', parentLaneId: 'l4' }),
      lane([], { id: 'l4', parentLaneId: 'l3' }),
    ], now)
    const keys = visibleRows(tree, new Set()).map((r) => r.key)
    for (const k of ['a', 'b', 'x', laneKey('l2'), laneKey('l3'), laneKey('l4')]) expect(keys).toContain(k)
  })

  it('stays fast on 2 000 spans', () => {
    const many = Array.from({ length: 2000 }, (_, i) => item(`c${i}`, { parentId: i % 10 === 0 ? undefined : `c${i - (i % 10)}`, startedAt: T0 + i * 10, endedAt: T0 + i * 10 + 50 }))
    const t = performance.now()
    const tree = buildTraceTree([lane(many)], now)
    const rows = visibleRows(tree, new Set())
    expect(rows).toHaveLength(2001)
    expect(performance.now() - t).toBeLessThan(500)
  })
})
