/**
 * The pairing rule of provider interruptions: a `down` and its `up` are ONE
 * interval, and an interval is never lost when only half of it is on screen.
 *
 * Run with: npx vitest run src/components/timeline/outage.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { ChatMessage, ContentBlock } from '@/types'
import { openOutages, outageKey, pairOutages, readOutageEvents } from './outage'

/** The instant the outage began — the SAME `started_at` on the `down` and on its `up`. */
const START = '2026-10-16T14:05:29Z'
const T0 = Date.parse(START)
const iso = (offsetS: number) => new Date(T0 + offsetS * 1000).toISOString()

const outage = (id: string, phase: 'down' | 'up', seenS: number, over: Record<string, unknown> = {}): ContentBlock => ({
  id,
  type: 'provider_outage',
  content: phase === 'down' ? 'deepseek-prod is out of service — automatic retry.' : 'deepseek-prod is back.',
  metadata: {
    phase,
    provider_id: 'deepseek-prod',
    failures: phase === 'down' ? 3 : 0,
    started_at: START,
    created_at: iso(seenS),
    ...over,
  },
})

const assistant = (id: string, blocks: ContentBlock[], seenS: number): ChatMessage => ({
  id,
  role: 'assistant',
  timestamp: new Date(T0 + seenS * 1000),
  blocks,
})

describe('pairOutages', () => {
  it('makes ONE interval of a down and the up that shares its started_at', () => {
    const spans = pairOutages([
      { ...readOutageEvents([assistant('m1', [outage('b1', 'down', 0)], 0)])[0]! },
      { ...readOutageEvents([assistant('m2', [outage('b2', 'up', 30, { duration_ms: 4200, cause: 'connection refused' })], 30)])[0]! },
    ])
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      key: outageKey('deepseek-prod', START),
      providerId: 'deepseek-prod',
      startedAt: T0,
      endedAt: T0 + 4200,
      durationMs: 4200,
      failures: 3,
      cause: 'connection refused',
      open: false,
    })
  })

  it('leaves an interval OPEN while no up was read, and says so', () => {
    const [span] = pairOutages(readOutageEvents([assistant('m1', [outage('b1', 'down', 0)], 0)]))
    expect(span).toMatchObject({ open: true, startedAt: T0, failures: 3 })
    expect(span.endedAt).toBeUndefined()
  })

  it('keeps a closed interval when only the up was read (the down is on an older page)', () => {
    const [span] = pairOutages(readOutageEvents([assistant('m1', [outage('b2', 'up', 30, { duration_ms: 4200 })], 30)]))
    // `started_at` + `duration_ms` carry the bounds on their own: nothing is lost.
    expect(span).toMatchObject({ open: false, startedAt: T0, endedAt: T0 + 4200, durationMs: 4200 })
    expect(span.downAt).toBeUndefined()
    expect(span.upAt).toBe(T0 + 30_000)
  })

  it('does not duplicate an interval replayed twice (the transcript then the history)', () => {
    const down = readOutageEvents([assistant('m1', [outage('b1', 'down', 0)], 0)])[0]!
    const up = readOutageEvents([assistant('m2', [outage('b2', 'up', 30, { duration_ms: 4200 })], 30)])[0]!
    expect(pairOutages([down, up, { ...down }, { ...up }])).toHaveLength(1)
  })

  it('never crosses two instances that fail at the same second', () => {
    const a = readOutageEvents([assistant('m1', [outage('a1', 'down', 0, { provider_id: 'a' })], 0)])[0]!
    const b = readOutageEvents([assistant('m2', [outage('b1', 'down', 1, { provider_id: 'b' })], 1)])[0]!
    const aUp = readOutageEvents([assistant('m3', [outage('a2', 'up', 9, { provider_id: 'a', duration_ms: 9000 })], 9)])[0]!
    const spans = pairOutages([a, b, aUp])
    expect(spans).toHaveLength(2)
    expect(spans.find((s) => s.providerId === 'a')).toMatchObject({ open: false, durationMs: 9000 })
    expect(spans.find((s) => s.providerId === 'b')).toMatchObject({ open: true })
  })
})

describe('openOutages', () => {
  it('keeps only the instances that have not answered again', () => {
    const messages = [
      assistant('m1', [outage('b1', 'down', 0)], 0),
      assistant('m2', [outage('b2', 'down', 10, { provider_id: 'other' })], 10),
      assistant('m3', [outage('b3', 'up', 20, { duration_ms: 20_000 })], 20),
    ]
    const open = openOutages(messages)
    expect(open.map((s) => s.providerId)).toEqual(['other'])
    expect(open[0]!.open).toBe(true)
  })

  it('says nothing of a conversation with no interruption at all', () => {
    expect(openOutages([assistant('m1', [{ id: 't', type: 'text', content: 'hi' }], 0)])).toEqual([])
  })
})
