/**
 * The status line and the activity map.
 *
 * Each test here names a way a working conversation used to look dead, or a
 * way a stopped one used to look alive. Both were real: the list learnt
 * `is_streaming` only from CRUD events received while it was mounted, so a
 * reload showed every running conversation as idle, and a dropped "stopped"
 * event left a "Working…" that nothing could clear.
 */
import { describe, it, expect } from 'vitest'
import type { SessionActivity } from '@/types'
import {
  applySnapshot,
  applyStreamingEvent,
  applyWindow,
  anyLive,
  describeActivity,
  isQuiet,
  normalizeActivity,
} from './sessionActivity'

const activity = (p: Partial<SessionActivity> = {}): SessionActivity => ({
  live: false,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  ...p,
})

describe('describeActivity', () => {
  it('says nothing for a session that is not running', () => {
    expect(describeActivity(undefined)).toBeNull()
    expect(describeActivity(activity())).toBeNull()
  })

  it('says it is working while a turn streams', () => {
    const s = describeActivity(activity({ live: true, streaming: true }))
    expect(s?.label).toBe('Working…')
    expect(s?.tone).toBe('working')
    expect(s?.pulse).toBe(true)
  })

  it('names a watch, even though the turn produces nothing — the case that looked dead', () => {
    const s = describeActivity(activity({ live: true, monitors: 1 }))
    expect(s?.label).toBe('Watching 1 target')
    expect(s?.pulse).toBe(true)
  })

  it('pluralises watches without ever writing "1 targets"', () => {
    expect(describeActivity(activity({ live: true, monitors: 3 }))?.label).toBe('Watching 3 targets')
    expect(describeActivity(activity({ live: true, bash_tasks: 1 }))?.label).toBe(
      '1 background task running',
    )
    expect(describeActivity(activity({ live: true, bash_tasks: 2 }))?.label).toBe(
      '2 background tasks running',
    )
  })

  it('puts what blocks on the human first, ahead of what the agent is doing alone', () => {
    const s = describeActivity(
      activity({ live: true, streaming: true, pending_permissions: 1, monitors: 2 }),
    )
    expect(s?.tone).toBe('blocked')
    expect(s?.label.startsWith('Waiting for your approval')).toBe(true)
    // The secondary state is still reachable, and the full sentence keeps all of them.
    expect(s?.label).toContain('working…')
    expect(s?.detail).toBe('Waiting for your approval · Working… · Watching 2 targets')
  })

  it('counts several pending approvals', () => {
    expect(describeActivity(activity({ live: true, pending_permissions: 2 }))?.label).toBe(
      'Waiting for your approval (2)',
    )
  })

  it('still speaks for a live session that is merely waiting for the user', () => {
    const s = describeActivity(activity({ live: true }))
    expect(s).not.toBeNull()
    expect(s?.label).toBe('Idle — waiting for you')
    expect(s?.pulse).toBe(false)
  })

  it('never renders NaN, whatever an older server sends', () => {
    const rubbish = {
      live: true,
      streaming: false,
      monitors: Number.NaN,
      bash_tasks: -4,
    } as unknown as SessionActivity
    const s = describeActivity(rubbish)
    expect(s?.label).toBe('Idle — waiting for you')
    expect(normalizeActivity(rubbish)).toEqual(activity({ live: true }))
  })
})

describe('isQuiet / anyLive', () => {
  it('treats absence as quiet, because that is what the server means by omitting the field', () => {
    expect(isQuiet(undefined)).toBe(true)
    expect(isQuiet(activity())).toBe(true)
    expect(isQuiet(activity({ live: true }))).toBe(false)
  })

  it('reports whether anything is worth re-reading the server for', () => {
    expect(anyLive([])).toBe(false)
    expect(anyLive([activity(), activity()])).toBe(false)
    expect(anyLive([activity(), activity({ monitors: 1 })])).toBe(true)
  })
})

describe('applyWindow', () => {
  it('clears a stale working state for a session the listing now reports quiet', () => {
    const before = new Map([['a', activity({ live: true, streaming: true })]])
    const after = applyWindow(before, [{ id: 'a' }])
    expect(after.has('a')).toBe(false)
  })

  it('leaves sessions outside the listed window alone — the response says nothing about them', () => {
    const before = new Map([['a', activity({ live: true, streaming: true })]])
    const after = applyWindow(before, [{ id: 'b', activity: activity({ live: true }) }])
    expect(after.get('a')?.streaming).toBe(true)
    expect(after.get('b')?.live).toBe(true)
  })

  it('does not mutate the map it was given', () => {
    const before = new Map([['a', activity({ live: true, streaming: true })]])
    applyWindow(before, [{ id: 'a' }])
    expect(before.has('a')).toBe(true)
  })
})

describe('applySnapshot', () => {
  it('replaces the whole map, so a session that stopped cannot survive a merge', () => {
    const before = new Map([
      ['a', activity({ live: true, streaming: true })],
      ['b', activity({ live: true, monitors: 1 })],
    ])
    // The server now reports only b. `a` must be gone, not merged through.
    const after = applySnapshot({ b: activity({ live: true, monitors: 1 }) })
    expect(before.has('a')).toBe(true) // untouched input
    expect(after.has('a')).toBe(false)
    expect(after.get('b')?.monitors).toBe(1)
  })

  it('survives an empty or malformed body', () => {
    expect(applySnapshot({}).size).toBe(0)
    expect(applySnapshot(undefined as unknown as Record<string, SessionActivity>).size).toBe(0)
  })
})

describe('applyStreamingEvent', () => {
  it('lights up a session the map had never heard of', () => {
    const after = applyStreamingEvent(new Map(), 'a', true)
    expect(describeActivity(after.get('a'))?.label).toBe('Working…')
  })

  it('ends the turn without killing a watch that is still running', () => {
    const before = new Map([['a', activity({ live: true, streaming: true, monitors: 2 })]])
    const after = applyStreamingEvent(before, 'a', false)
    expect(after.get('a')?.streaming).toBe(false)
    expect(describeActivity(after.get('a'))?.label).toBe('Watching 2 targets')
  })

  it('drops the entry when the turn was the only thing happening', () => {
    const before = new Map([['a', activity({ live: true, streaming: true })]])
    const after = applyStreamingEvent(before, 'a', false)
    // `live` alone would keep the row claiming something; the event says the
    // turn is over and nothing else is tracked, so the row goes back to its
    // preview rather than to a permanent "Idle".
    expect(after.get('a')?.streaming).toBe(false)
  })

  it('ignores a stop for a session it does not track', () => {
    expect(applyStreamingEvent(new Map(), 'a', false).size).toBe(0)
  })
})
