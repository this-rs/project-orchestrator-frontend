import { describe, it, expect } from 'vitest'
import {
  shouldEnqueue,
  enqueue,
  removeFromQueue,
  editInQueue,
  prioritize,
  applyQueueOp,
  fromServerEntry,
  mergeServerQueue,
  type QueuedMessage,
} from './messageQueue'

const msg = (id: string, text: string, queuedAt = 0): QueuedMessage => ({ id, text, queuedAt })

describe('shouldEnqueue', () => {
  it('queues while streaming', () => {
    expect(shouldEnqueue({ isStreaming: true })).toBe(true)
  })

  it('never queues when idle — the queue must not become an extra click on the common path', () => {
    expect(shouldEnqueue({ isStreaming: false })).toBe(false)
  })
})

describe('enqueue', () => {
  it('appends, preserving order', () => {
    const q = enqueue(enqueue([], 'first', 'a', 1), 'second', 'b', 2)
    expect(q.map((m) => m.text)).toEqual(['first', 'second'])
    expect(q.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('trims the text', () => {
    expect(enqueue([], '  padded  ', 'a', 1)[0].text).toBe('padded')
  })

  it('rejects whitespace-only text without growing the queue', () => {
    expect(enqueue([], '   \n ', 'a', 1)).toEqual([])
  })

  it('does not mutate the input queue', () => {
    const original = [msg('a', 'one')]
    enqueue(original, 'two', 'b', 2)
    expect(original).toHaveLength(1)
  })
})

describe('removeFromQueue', () => {
  it('drops the matching id and keeps the rest in order', () => {
    const q = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    expect(removeFromQueue(q, 'b').map((m) => m.id)).toEqual(['a', 'c'])
  })

  it('treats an unknown id as a no-op rather than an error', () => {
    const q = [msg('a', 'one')]
    expect(removeFromQueue(q, 'zzz')).toEqual(q)
  })
})

describe('editInQueue', () => {
  it('replaces the text in place, preserving position and queuedAt', () => {
    const q = [msg('a', 'one', 10), msg('b', 'two', 20), msg('c', 'three', 30)]
    const edited = editInQueue(q, 'b', 'rewritten')
    expect(edited.map((m) => m.text)).toEqual(['one', 'rewritten', 'three'])
    expect(edited[1].queuedAt).toBe(20)
  })

  it('removes the message when edited to empty', () => {
    // An empty row would be a queue entry that can never be sent: the send
    // handler rejects empty text, so it would sit there forever.
    const q = [msg('a', 'one'), msg('b', 'two')]
    expect(editInQueue(q, 'a', '   ').map((m) => m.id)).toEqual(['b'])
  })

  it('trims', () => {
    expect(editInQueue([msg('a', 'one')], 'a', '  spaced  ')[0].text).toBe('spaced')
  })
})

describe('prioritize', () => {
  it('moves the message to the head and marks it', () => {
    const q = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    const p = prioritize(q, 'c')
    expect(p.map((m) => m.id)).toEqual(['c', 'a', 'b'])
    expect(p[0].prioritized).toBe(true)
  })

  it('preserves the relative order of everything else', () => {
    const q = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three'), msg('d', 'four')]
    expect(prioritize(q, 'c').map((m) => m.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('does not dispatch — the queue keeps the same length', () => {
    // The first click never dispatches: the message waits for the running
    // response to finish instead of cutting it short. Only a second click on an
    // already-prioritized row sends immediately, and that path goes through
    // `takeById`, not `prioritize`.
    const q = [msg('a', 'one'), msg('b', 'two')]
    expect(prioritize(q, 'b')).toHaveLength(2)
  })

  it('is idempotent', () => {
    const q = [msg('a', 'one'), msg('b', 'two')]
    expect(prioritize(prioritize(q, 'b'), 'b')).toEqual(prioritize(q, 'b'))
  })

  it('treats an unknown id as a no-op', () => {
    const q = [msg('a', 'one')]
    expect(prioritize(q, 'zzz')).toEqual(q)
  })
})

describe('applyQueueOp', () => {
  const q = () => [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]

  it('edits, drops and prioritizes like the server does', () => {
    expect(applyQueueOp(q(), { op: 'edit', id: 'b', content: ' new ' })[1].text).toBe('new')
    expect(applyQueueOp(q(), { op: 'remove', id: 'b' }).map((m) => m.id)).toEqual(['a', 'c'])
    expect(applyQueueOp(q(), { op: 'prioritize', id: 'c' }).map((m) => m.id)).toEqual(['c', 'a', 'b'])
  })

  it('takes a message sent now out of the list: it is on its way', () => {
    expect(applyQueueOp(q(), { op: 'send_now', id: 'a' }).map((m) => m.id)).toEqual(['b', 'c'])
  })
})

describe('the list the server publishes', () => {
  it('maps a server entry to a row', () => {
    expect(
      fromServerEntry({
        id: 's1',
        content: 'held',
        attachments: [{ id: 'doc-1' }],
        queued_at: '2026-10-04T12:00:00Z',
        prioritized: true,
      }),
    ).toEqual({
      id: 's1',
      text: 'held',
      queuedAt: Date.parse('2026-10-04T12:00:00Z'),
      attachmentIds: ['doc-1'],
      prioritized: true,
    })
  })

  it('replaces everything the server knows about and keeps what was not handed over yet', () => {
    const current: QueuedMessage[] = [msg('old-server', 'stale'), { ...msg('l1', 'not sent yet'), local: true }]
    const merged = mergeServerQueue(current, [{ id: 's1', content: 'held', queued_at: '2026-10-04T12:00:00Z' }])
    expect(merged.map((m) => m.id)).toEqual(['s1', 'l1'])
  })

  it('an empty server list clears the rows the server had', () => {
    expect(mergeServerQueue([msg('s1', 'delivered')], [])).toEqual([])
  })
})
