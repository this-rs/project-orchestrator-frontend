import { describe, it, expect } from 'vitest'
import {
  shouldEnqueue,
  enqueue,
  removeFromQueue,
  editInQueue,
  takeById,
  takeHead,
  prioritize,
  QUEUE_POLICY,
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

describe('takeById', () => {
  it('returns the message and the queue without it', () => {
    const q = [msg('a', 'one'), msg('b', 'two')]
    const { taken, rest } = takeById(q, 'a')
    expect(taken?.text).toBe('one')
    expect(rest.map((m) => m.id)).toEqual(['b'])
  })

  it('returns the taken message so the caller dispatches exactly what it removed', () => {
    // Guards against a read-then-filter in the caller racing with a concurrent
    // edit and sending stale text.
    const q = [msg('a', 'original')]
    const { taken, rest } = takeById(q, 'a')
    expect(taken).toEqual(msg('a', 'original'))
    expect(rest).toEqual([])
  })

  it('returns null and an unchanged copy for an unknown id', () => {
    const q = [msg('a', 'one')]
    const { taken, rest } = takeById(q, 'zzz')
    expect(taken).toBeNull()
    expect(rest).toEqual(q)
  })
})

describe('takeHead', () => {
  it('takes the oldest, leaving the rest in order', () => {
    const q = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    const { taken, rest } = takeHead(q)
    expect(taken?.id).toBe('a')
    expect(rest.map((m) => m.id)).toEqual(['b', 'c'])
  })

  it('is safe on an empty queue', () => {
    const { taken, rest } = takeHead([])
    expect(taken).toBeNull()
    expect(rest).toEqual([])
  })

  it('drains fully in FIFO order when applied repeatedly', () => {
    // The auto-flush loop: one message per finished turn, oldest first.
    let q: QueuedMessage[] = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    const sent: string[] = []
    for (;;) {
      const { taken, rest } = takeHead(q)
      if (!taken) break
      sent.push(taken.text)
      q = rest
    }
    expect(sent).toEqual(['one', 'two', 'three'])
    expect(q).toEqual([])
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

  it('makes takeHead pick the prioritized message next', () => {
    // prioritize + auto-flush compose: the marked message is what leaves when
    // the current response ends.
    const q = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    expect(takeHead(prioritize(q, 'c')).taken?.id).toBe('c')
  })
})

describe('QUEUE_POLICY', () => {
  it('records the two product decisions in one place', () => {
    // Not a behaviour test — a tripwire. Flipping one of these is a product
    // change and should show up in a diff as such, not slip through a refactor.
    expect(QUEUE_POLICY).toEqual({
      autoFlushOnIdle: true,
      flushAll: false,
      manualSendInterrupts: 'second-click',
    })
  })
})
