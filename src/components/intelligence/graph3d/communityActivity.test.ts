import { describe, it, expect } from 'vitest'
import {
  COMMUNITY_ACTIVITY_DECAY_MS,
  COMMUNITY_ACTIVITY_MAX,
  COMMUNITY_FILL_OPACITY_REST,
  COMMUNITY_FILL_OPACITY_PEAK,
  COMMUNITY_WIRE_OPACITY_REST,
  COMMUNITY_WIRE_OPACITY_PEAK,
  CommunityActivityClock,
  buildCommunityIndex,
  communityActivity,
  communityFillOpacity,
  communityIntensityAt,
  communityWireOpacity,
} from './communityActivity'

const communities = new Map<string, number>([
  ['note-a', 3],
  ['task-b', 7],
  ['src/x.rs', 3],
])

describe('communityIntensityAt', () => {
  it('is 1 at age 0, 0.5 at half the duration, and 0 at/after it', () => {
    expect(communityIntensityAt(0)).toBe(1)
    expect(communityIntensityAt(COMMUNITY_ACTIVITY_DECAY_MS / 2)).toBeCloseTo(0.5, 6)
    expect(communityIntensityAt(COMMUNITY_ACTIVITY_DECAY_MS)).toBe(0)
    expect(communityIntensityAt(COMMUNITY_ACTIVITY_DECAY_MS + 1)).toBe(0)
  })

  it('clamps a negative (future) age to the max', () => {
    expect(communityIntensityAt(-50)).toBe(COMMUNITY_ACTIVITY_MAX)
  })

  it('is bounded in [0, 1] across the whole window', () => {
    for (let age = -100; age <= COMMUNITY_ACTIVITY_DECAY_MS + 100; age += 17) {
      const v = communityIntensityAt(age)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('communityActivity', () => {
  it('a recent event on an entity of a community gives that community 1.0', () => {
    const active = communityActivity([{ entityId: 'note-a', at: 1000 }], communities, 1000)
    expect([...active.entries()]).toEqual([[3, 1]])
  })

  it('the same intensity is 0.5 at half the duration, and 0 after', () => {
    const at = 1000
    const half = communityActivity([{ entityId: 'note-a', at }], communities, at + COMMUNITY_ACTIVITY_DECAY_MS / 2)
    expect(half.get(3)).toBeCloseTo(0.5, 6)
    const after = communityActivity([{ entityId: 'note-a', at }], communities, at + COMMUNITY_ACTIVITY_DECAY_MS)
    expect(after.size).toBe(0)
    expect(communityActivity([{ entityId: 'note-a', at }], communities, at + COMMUNITY_ACTIVITY_DECAY_MS + 1).size).toBe(0)
  })

  it('two close events on one community never exceed 1.0', () => {
    const active = communityActivity(
      [
        { entityId: 'note-a', at: 0 },
        { entityId: 'src/x.rs', at: 0 },
      ],
      communities,
      0,
    )
    expect(active.get(3)).toBe(1)
    // Slightly staggered, still capped.
    const staggered = communityActivity(
      [
        { entityId: 'note-a', at: 0 },
        { entityId: 'src/x.rs', at: 100 },
      ],
      communities,
      100,
    )
    expect(staggered.get(3)).toBe(1)
    expect(staggered.get(3)).toBeLessThanOrEqual(COMMUNITY_ACTIVITY_MAX)
  })

  it('an event on an unknown entity lights no community', () => {
    const active = communityActivity([{ entityId: 'ghost-id', at: 0 }], communities, 0)
    expect(active.size).toBe(0)
  })

  it('the active community list empties once everything has decayed', () => {
    const events = [
      { entityId: 'note-a', at: 0 },
      { entityId: 'task-b', at: 500 },
    ]
    expect(communityActivity(events, communities, 1000).size).toBe(2)
    // note-a decays at 2500, task-b at 3000.
    expect(communityActivity(events, communities, 2600).size).toBe(1)
    expect(communityActivity(events, communities, 3100).size).toBe(0)
  })

  it('sums events across DIFFERENT communities independently', () => {
    const active = communityActivity(
      [
        { entityId: 'note-a', at: 0 },
        { entityId: 'task-b', at: 0 },
      ],
      communities,
      0,
    )
    expect(active.get(3)).toBe(1)
    expect(active.get(7)).toBe(1)
  })
})

describe('communityFillOpacity / communityWireOpacity', () => {
  it('is the rest opacity at 0 and the peak at 1', () => {
    expect(communityFillOpacity(0)).toBe(COMMUNITY_FILL_OPACITY_REST)
    expect(communityFillOpacity(1)).toBe(COMMUNITY_FILL_OPACITY_PEAK)
    expect(communityWireOpacity(0)).toBe(COMMUNITY_WIRE_OPACITY_REST)
    expect(communityWireOpacity(1)).toBe(COMMUNITY_WIRE_OPACITY_PEAK)
  })

  it('is monotonic and bounded between rest and peak', () => {
    const half = communityFillOpacity(0.5)
    expect(half).toBeCloseTo((COMMUNITY_FILL_OPACITY_REST + COMMUNITY_FILL_OPACITY_PEAK) / 2, 6)
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      expect(communityFillOpacity(t)).toBeGreaterThanOrEqual(COMMUNITY_FILL_OPACITY_REST)
      expect(communityFillOpacity(t)).toBeLessThanOrEqual(COMMUNITY_FILL_OPACITY_PEAK)
      expect(communityWireOpacity(t)).toBeGreaterThanOrEqual(COMMUNITY_WIRE_OPACITY_REST)
      expect(communityWireOpacity(t)).toBeLessThanOrEqual(COMMUNITY_WIRE_OPACITY_PEAK)
    }
  })
})

describe('buildCommunityIndex', () => {
  it('maps entity ids to their community and skips nodes without one', () => {
    const index = buildCommunityIndex([
      { id: 'a', communityId: 2 },
      { id: 'b', communityId: 2 },
      { id: 'c', communityId: undefined },
      { id: 'd', communityId: 5 },
    ])
    expect([...index.entries()]).toEqual([
      ['a', 2],
      ['b', 2],
      ['d', 5],
    ])
  })

  it('is empty for an empty list', () => {
    expect(buildCommunityIndex([]).size).toBe(0)
  })
})

describe('CommunityActivityClock', () => {
  it('trigger returns false for an unknown entity and records known ones', () => {
    const c = new CommunityActivityClock({ current: communities })
    expect(c.trigger('ghost', 0)).toBe(false)
    expect(c.size).toBe(0)
    expect(c.trigger('note-a', 0)).toBe(true)
    expect(c.size).toBe(1)
  })

  it('resolves against the CURRENT index at tick time (ref, not capture)', () => {
    const ref: { current: Map<string, number> } = { current: new Map([['note-a', 3]]) }
    const c = new CommunityActivityClock(ref)
    c.trigger('note-a', 0)
    // The community is renumbered (e.g. hulls rebuilt): the SAME event now
    // lights community 9, not the captured 3.
    ref.current = new Map([['note-a', 9]])
    expect([...c.tick(0).entries()]).toEqual([[9, 1]])
  })

  it('prunes decayed events and clears', () => {
    const c = new CommunityActivityClock({ current: communities })
    c.trigger('note-a', 0)
    c.trigger('task-b', 0)
    expect(c.tick(COMMUNITY_ACTIVITY_DECAY_MS + 1).size).toBe(0)
    expect(c.size).toBe(0)
    c.trigger('note-a', 0)
    expect(c.size).toBe(1)
    c.clear()
    expect(c.size).toBe(0)
  })
})
