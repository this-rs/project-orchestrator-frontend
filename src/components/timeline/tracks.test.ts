import { describe, expect, it } from 'vitest'
import { buildTracks, findOnTracks, packRows, type TrackItem } from './tracks'
import type { TimelineItem, TimelineLane } from './model'

const T0 = 1_700_000_000_000
const NOW = T0 + 60_000
const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem => ({
  id, kind: 'tool', status: 'done', label: id, startedAt: T0, endedAt: T0 + 1000, durationMs: 1000, laneId: 'l', ...over,
})
const span = (id: string, from: number, to: number, over: Partial<TimelineItem> = {}) =>
  item(id, { startedAt: T0 + from, endedAt: T0 + to, durationMs: to - from, ...over })
const lane = (items: TimelineItem[], over: Partial<TimelineLane> = {}): TimelineLane => ({ id: 'l', title: 'Conversation', items, ...over })
const ti = (start: number, end: number): TrackItem => ({ item: item('x'), start, end, instant: start === end })

const names = (layout: ReturnType<typeof buildTracks>) => layout.tracks.map((t) => `${t.family}${t.agent ? `@${t.agent.id}` : ''}#${t.row}: ${t.items.map((i) => i.item.id).join(',')}`)

describe('packRows', () => {
  it('shares a row between things that follow each other, and opens a row for things at once', () => {
    expect(packRows([ti(0, 10), ti(10, 20), ti(15, 30), ti(20, 25)])).toEqual({ rowOf: [0, 0, 1, 0], rows: 2 })
  })
  it('an instant takes a row too, and the next thing at the same moment shares it', () => {
    expect(packRows([ti(5, 5), ti(5, 5), ti(5, 9)])).toEqual({ rowOf: [0, 0, 0], rows: 1 })
  })
  it('three things at once are three rows', () => {
    expect(packRows([ti(0, 10), ti(1, 10), ti(2, 10)]).rows).toBe(3)
  })
})

describe('buildTracks', () => {
  it('one row per family when nothing overlaps: the turn, its calls, its wait, its events', () => {
    const layout = buildTracks([lane([
      span('req', 0, 6000, { kind: 'request' }),
      span('read', 500, 1000, { parentId: 'req' }),
      span('perm', 1000, 1500, { kind: 'permission', parentId: 'write', status: 'done' }),
      span('write', 1500, 2000, { parentId: 'req' }),
      span('route', 100, 100, { kind: 'routing', parentId: 'req' }),
      span('oops', 5000, 5000, { kind: 'error', parentId: 'req' }),
    ])], NOW)
    expect(names(layout)).toEqual(['turns#0: req', 'tools#0: read,write', 'waits#0: perm', 'signals#0: route,oops'])
    expect(layout.itemCount).toBe(6)
    expect(layout.tracks[3]?.items.map((i) => i.instant)).toEqual([true, true])
  })

  it('two calls at once are two rows of the same family; the next call takes the first free row', () => {
    const layout = buildTracks([lane([
      span('req', 0, 6000, { kind: 'request' }),
      span('a', 300, 1100, { parentId: 'req' }),
      span('b', 300, 1700, { parentId: 'req' }),
      span('c', 1200, 1600, { parentId: 'req' }),
    ])], NOW)
    expect(names(layout)).toEqual(['turns#0: req', 'tools#0: a,c', 'tools#1: b'])
    expect(layout.tracks[1]?.rows).toBe(2)
  })

  it('a sub-agent is a bar on the agents row and its own calls are its own family, after the main tools', () => {
    const layout = buildTracks([lane([
      span('req', 0, 10_000, { kind: 'request' }),
      span('mine', 200, 800, { parentId: 'req' }),
      span('agent', 1000, 9000, { kind: 'agent', parentId: 'req' }),
      span('theirs1', 1200, 2000, { parentId: 'agent' }),
      span('theirs2', 1500, 2500, { parentId: 'agent' }),
      span('deep', 3000, 3500, { parentId: 'theirs2' }),
    ])], NOW)
    expect(names(layout)).toEqual([
      'turns#0: req', 'tools#0: mine', 'agents#0: agent', 'tools@agent#0: theirs1,deep', 'tools@agent#1: theirs2',
    ])
    expect(layout.tracks[3]?.agent?.id).toBe('agent')
  })

  it('a child session is its own group, with its span on an agents row', () => {
    const kid: TimelineLane = { id: 'kid', title: 'Delegated', relation: 'child', parentLaneId: 'l', items: [span('k1', 2000, 3000, { laneId: 'kid' })], span: span('run:kid', 1500, 4000, { kind: 'run', laneId: 'kid' }) }
    const layout = buildTracks([lane([span('req', 0, 5000, { kind: 'request' })]), kid], NOW)
    expect(layout.groups.map((g) => g.lane.id)).toEqual(['l', 'kid'])
    expect(names(layout)).toEqual(['turns#0: req', 'tools#0: k1', 'agents#0: run:kid'])
  })

  it('leaves out what has no date (a plan, a step) and a group with nothing dated', () => {
    const work: TimelineLane = { id: 'work', title: 'Plan', items: [item('p', { kind: 'plan', startedAt: 0 }), item('s', { kind: 'step', startedAt: 0 })] }
    const layout = buildTracks([work, lane([span('req', 0, 100, { kind: 'request' })])], NOW)
    expect(layout.groups.map((g) => g.lane.id)).toEqual(['l'])
    expect(layout.itemCount).toBe(1)
  })

  it('a running call ends at now and marks its track; an open wait shapes the axis by its start only', () => {
    const layout = buildTracks([lane([
      span('req', 0, 100, { kind: 'request', status: 'running', endedAt: undefined }),
      item('go', { startedAt: T0 + 200, endedAt: undefined, status: 'running' }),
      item('ask', { kind: 'permission', startedAt: T0 + 300, endedAt: undefined, status: 'blocked' }),
    ])], NOW)
    expect(layout.tracks.find((t) => t.family === 'tools')?.running).toBe(true)
    expect(layout.tracks.find((t) => t.family === 'tools')?.items[0]?.end).toBe(NOW)
    expect(layout.intervals).toContainEqual([T0 + 300, T0 + 300])
    expect(layout.intervals).toContainEqual([T0 + 200, NOW])
  })

  it('finds an item on its track', () => {
    const layout = buildTracks([lane([span('req', 0, 100, { kind: 'request' }), span('a', 0, 50), span('b', 50, 80)])], NOW)
    expect(findOnTracks(layout, 'b')).toMatchObject({ index: 1, track: { family: 'tools' } })
    expect(findOnTracks(layout, 'nope')).toBeNull()
  })
})
