/**
 * The provider interruption as the timeline shows it: the two events
 * (`down`, `up`) become ONE zone, with real bounds and a cause — the whole
 * chain, from the wire frame through the reducer to the timeline item.
 *
 * Run with: npx vitest run src/components/timeline/model.outage.test.ts
 */
import { describe, expect, it } from 'vitest'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { buildTimeline } from './model'

const START = '2026-10-16T14:05:29Z'
const T0 = Date.parse(START)
const iso = (offsetS: number) => new Date(T0 + offsetS * 1000).toISOString()

const down = (seenS: number, over: Record<string, unknown> = {}) => ({
  type: 'provider_outage',
  phase: 'down',
  provider_id: 'deepseek-prod',
  failures: 3,
  started_at: START,
  cause: 'connection refused',
  created_at: iso(seenS),
  ...over,
})
const up = (seenS: number, over: Record<string, unknown> = {}) => ({
  type: 'provider_outage',
  phase: 'up',
  provider_id: 'deepseek-prod',
  failures: 0,
  started_at: START,
  cause: 'connection refused',
  duration_ms: 4200,
  created_at: iso(seenS),
  ...over,
})

const zones = (events: Record<string, unknown>[]) => {
  const messages = historyEventsToMessages(events as never[])
  return buildTimeline({ messages, sessionId: 's', now: T0 + 60_000 }).items.filter((i) => i.kind === 'outage')
}

describe('the outage zone of a transcript', () => {
  it('makes ONE zone of a down and its up, with the bounds and the cause of the interval', () => {
    const items = zones([down(0), up(31)])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: `outage:deepseek-prod@${START}`,
      kind: 'outage',
      status: 'error',
      provider: 'deepseek-prod',
      cause: 'connection refused',
      startedAt: T0,
      endedAt: T0 + 4200,
      durationMs: 4200,
    })
  })

  it('keeps the zone OPEN (still running) while the up has not arrived: it grows to now', () => {
    const [zone] = zones([down(0)])
    expect(zone).toMatchObject({ status: 'running', provider: 'deepseek-prod', startedAt: T0 })
    expect(zone!.endedAt).toBeUndefined()
  })

  it('names the zone with the sentence the reducer stored, and never draws the raw event twice', () => {
    const items = zones([down(0), up(31)])
    expect(items[0]!.label).toContain('out of service')
    // The `up` does not add a second row: the pair is one interval.
    expect(items.filter((i) => i.id.startsWith('outage:'))).toHaveLength(1)
  })

  it('shows a closed zone even when the down is out of the loaded page (the up alone)', () => {
    const [zone] = zones([up(31)])
    expect(zone).toMatchObject({ status: 'error', startedAt: T0, endedAt: T0 + 4200, durationMs: 4200 })
  })

  it('draws nothing of a conversation with no interruption', () => {
    expect(zones([{ type: 'user_message', content: 'hi', created_at: iso(0) }])).toEqual([])
  })
})
