import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/types'
import { buildConversationTimeline, loadNewer, loadTailFirst, relayedSessions, type RawEvent, type TraceSession } from './conversation'

const at = (s: number) => new Date(Date.UTC(2026, 9, 10, 12, 0, s))
const user = (id: string, s: number): ChatMessage => ({ id, role: 'user', timestamp: at(s), blocks: [{ id: `${id}-b`, type: 'text', content: id }] })
const session = (over: Partial<TraceSession>): TraceSession => ({ id: 'root', title: 'Main', relation: 'root', isStreaming: false, messages: [], ...over })

/** A fake history of `n` events (seq 0..n-1), served page by page. */
function history(n: number) {
  const events: RawEvent[] = Array.from({ length: n }, (_, i) => ({ type: 'user_message', seq: i, content: `m${i}` }))
  const fetchPage = vi.fn(async (offset: number, limit: number) => ({ events: events.slice(offset, offset + limit), total: n }))
  return { events, fetchPage }
}

describe('loading a whole history', () => {
  it('a history of several pages is loaded down to the FIRST event, latest page first, always as a contiguous tail', async () => {
    const { events, fetchPage } = history(1234)
    const seen: Array<{ from: number; first: unknown; last: unknown; n: number }> = []
    const done = await loadTailFirst(fetchPage, 500, (p) => seen.push({ from: p.from, first: p.events[0]?.seq, last: p.events[p.events.length - 1]?.seq, n: p.events.length }))
    expect(done.events).toEqual(events)
    expect(done.from).toBe(0)
    // First what the reader sees in the chat (the latest events), then earlier and earlier.
    expect(seen.map((s) => s.from)).toEqual([734, 500, 0])
    for (const s of seen) {
      expect(s.last).toBe(1233)
      expect(s.first).toBe(s.from)
      expect(s.n).toBe(1234 - s.from)
    }
  })

  it('a short history takes one request', async () => {
    const { events, fetchPage } = history(42)
    const done = await loadTailFirst(fetchPage, 500, () => {})
    expect(done.events).toEqual(events)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('stops where it is when cancelled, and says from where it has the history', async () => {
    const { fetchPage } = history(3000)
    let calls = 0
    const done = await loadTailFirst(fetchPage, 500, () => { calls += 1 }, () => calls >= 2)
    expect(done.from).toBeGreaterThan(0)
    expect(done.events[done.events.length - 1]!.seq).toBe(2999)
  })

  it('fetches only what came after what is loaded', async () => {
    const { fetchPage } = history(1100)
    const page = await loadNewer(fetchPage, 400, 500)
    expect(page.events.map((e) => e.seq)).toEqual(Array.from({ length: 700 }, (_, i) => 400 + i))
    expect(page.total).toBe(1100)
  })
})

describe('relays', () => {
  it('finds the threads a history was relayed from or to', () => {
    const events: RawEvent[] = [
      { type: 'conversation_relayed', from_session_id: 'old', to_session_id: 'root' },
      { type: 'conversation_relayed', from_session_id: 'root', to_session_id: 'next' },
      { type: 'user_message' },
    ]
    expect(relayedSessions('root', events).sort()).toEqual(['next', 'old'])
  })
})

describe('buildConversationTimeline', () => {
  it('gives each session its lane: the relayed thread before the root, the child below its parent with a span of its own', () => {
    const tl = buildConversationTimeline({
      rootId: 'root',
      now: at(100).getTime(),
      sessions: [
        session({ messages: [user('r1', 50)] }),
        session({ id: 'old', title: 'Before the switch', relation: 'relay', provider: 'native', messages: [user('o1', 10), user('o2', 20)] }),
        session({ id: 'kid', title: 'Delegated', relation: 'child', parentId: 'root', isStreaming: true, createdAt: at(55).toISOString(), messages: [user('k1', 56)] }),
      ],
    })
    expect(tl.lanes.map((l) => [l.id, l.relation, l.parentLaneId])).toEqual([
      ['old', 'relay', undefined],
      ['root', 'root', undefined],
      ['kid', 'child', 'root'],
    ])
    const kid = tl.lanes[2]!
    expect(kid.span).toMatchObject({ kind: 'run', status: 'running', sessionId: 'kid', startedAt: at(55).getTime() })
    expect(tl.lanes[0]!.span).toMatchObject({ provider: 'native', status: 'done', endedAt: at(20).getTime() })
    // The first message of the whole conversation is there.
    expect(tl.items[0]!.startedAt).toBe(at(10).getTime())
    expect(tl.items.some((i) => i.id === 'request:o1')).toBe(true)
    expect(tl.runningCount).toBeGreaterThan(0)
  })

  it('puts the work lane first and only for the root', () => {
    const tl = buildConversationTimeline({
      rootId: 'root',
      sessions: [session({ messages: [user('r1', 1)] }), session({ id: 'kid', relation: 'child', parentId: 'root', messages: [] })],
      work: { plans: [{ id: 'p', title: 'Plan', status: 'in_progress' }], tasks: [] },
    })
    expect(tl.lanes[0]!.relation).toBe('work')
    expect(tl.lanes.filter((l) => l.relation === 'work')).toHaveLength(1)
  })

  it('a child whose parent is not loaded stays at the top level', () => {
    const tl = buildConversationTimeline({ rootId: 'root', sessions: [session({}), session({ id: 'kid', relation: 'child', parentId: 'gone' })] })
    expect(tl.lanes.find((l) => l.id === 'kid')!.parentLaneId).toBeUndefined()
  })
})
