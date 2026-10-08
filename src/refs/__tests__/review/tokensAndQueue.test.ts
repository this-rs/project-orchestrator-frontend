/**
 * Findings of the adversarial review of the `#` references, pure parts:
 * what counts as a token (B5), a queued message edited (B3), a stored block
 * read only under refs_v1 (B10), the answer bound to its message (B2).
 *
 * Run with: npx vitest run src/refs/__tests__/review/tokensAndQueue.test.ts
 */
import { describe, it, expect } from 'vitest'
import { findRefTokens, splitRefs } from '@/utils/messageRefs'
import { bindResolvedRefs, countRefTokens, reconcileRefs } from '@/refs/refState'
import { detectTrigger, isReferenceQuery } from '@/refs/trigger'
import { enqueue, editInQueue, applyQueueOp } from '@/components/chat/messageQueue'
import { decodeStoredRefs } from '@/utils/chatAssembly'
import tokens from '@/refs/__fixtures__/tokens.json'
import type { ChatMessage } from '@/types/chat'

const U = '57cf05c9-25b6-495d-ab07-de4b11d64736'
const V = '3adeffc9-c8b0-4e2f-a674-55bfcb293433'

describe('B5 - tokens are read like the trigger reads them', () => {
  it('inline code with a space before # is not a ref', () => {
    expect(reconcileRefs('run `ls #plan:' + U + '`')).toEqual([])
  })
  it('a fenced block is not a ref', () => {
    expect(reconcileRefs('```\necho #task:' + U + '\n```')).toEqual([])
    expect(reconcileRefs('~~~\n #task:' + U + '\n~~~')).toEqual([])
  })
  it('the destination of a markdown link is not a ref', () => {
    expect(reconcileRefs('[see](#plan:' + U + ')')).toEqual([])
    expect(reconcileRefs('[see]: #plan:' + U)).toEqual([])
  })
  it('a token after the code, or in parentheses that are not a link, still is one', () => {
    expect(reconcileRefs('`x` then #plan:' + U)).toHaveLength(1)
    expect(reconcileRefs('(voir #plan:' + U + ')')).toHaveLength(1)
    expect(reconcileRefs('```\ncode\n```\nthen #plan:' + U)).toHaveLength(1)
  })
  it('trigger and tokens agree on code', () => {
    expect(detectTrigger('`ls #pl', 7)).toBeNull()
    expect(findRefTokens('`ls #plan:' + U + '`')).toHaveLength(0)
  })
  it('a letter or digit of any script glued to the id is not a token', () => {
    for (const glued of ['é', 'ß', '中', '٣', 'a', '7', '_', '-']) {
      expect(findRefTokens('#plan:' + U + glued)).toHaveLength(0)
    }
    expect(findRefTokens('#plan:' + U + ' é')).toHaveLength(1)
    expect(findRefTokens('#plan:' + U + '.')).toHaveLength(1)
  })
  it('the golden fixtures still hold', () => {
    for (const v of tokens.valid) expect(findRefTokens(`voir ${v.token}`).length).toBeGreaterThan(0)
  })
})

describe('B1 - a bare number is prose, not a search', () => {
  it('`closes #42` is not a reference query; `#42x`, `#` and `#rfc 42` are', () => {
    const q = (s: string) => detectTrigger(s, s.length)!
    expect(isReferenceQuery(q('closes #42'))).toBe(false)
    expect(isReferenceQuery(q('closes #'))).toBe(true)
    expect(isReferenceQuery(q('see #re'))).toBe(true)
    expect(isReferenceQuery(q('see #42a'))).toBe(true)
    expect(isReferenceQuery(q('see #rfc 42'))).toBe(true)
  })
})

describe('B3 - the text of an edited queued message is the source of truth for its refs', () => {
  it('a token deleted by the edit takes its ref with it', () => {
    const q = enqueue([], 'see #plan:' + U, 'a', 1, undefined, [{ kind: 'plan', id: U }])
    expect(editInQueue(q, 'a', 'never mind')[0].refs).toBeUndefined()
  })
  it('a token added by the edit brings a ref', () => {
    const q = enqueue([], 'hi', 'a', 1)
    expect(editInQueue(q, 'a', 'hi #plan:' + U)[0].refs).toEqual([{ kind: 'plan', id: U }])
  })
  it('one token kept, one dropped, one added: exactly the tokens of the new text', () => {
    const q = enqueue([], `#plan:${U} #task:${V}`, 'a', 1, undefined, [
      { kind: 'plan', id: U },
      { kind: 'task', id: V },
    ])
    expect(editInQueue(q, 'a', `#task:${V} #note:9f1c2b7e-4d3a-4e58-8a61-0b2c7d9e1a10`)[0].refs).toEqual([
      { kind: 'task', id: V },
      { kind: 'note', id: '9f1c2b7e-4d3a-4e58-8a61-0b2c7d9e1a10' },
    ])
  })
  it('without refs_v1 an edit never gives the entry a ref', () => {
    const q = enqueue([], 'hi', 'a', 1)
    const e = applyQueueOp(q, { op: 'edit', id: 'a', content: 'hi #plan:' + U }, false)
    expect(e[0].refs).toBeUndefined()
  })
  it('the other rows are untouched', () => {
    const q = enqueue(enqueue([], 'x', 'a', 1), 'y #plan:' + U, 'b', 2, undefined, [{ kind: 'plan', id: U }])
    expect(editInQueue(q, 'a', 'x2')[1]).toBe(q[1])
  })
})

describe('B10 - a stored block is read only under refs_v1', () => {
  const c = 'x\n\n<po-refs>[{"kind":"plan","id":"' + U + '"}]</po-refs>'
  it('without the flag the whole text stays visible', () => {
    expect(splitRefs(c, false)).toEqual({ text: c, refs: [] })
  })
  it('with the flag a replayed history is decoded', () => {
    expect(splitRefs(c, true)).toEqual({ text: 'x', refs: [{ kind: 'plan', id: U }] })
    expect(splitRefs(c)).toEqual({ text: 'x', refs: [{ kind: 'plan', id: U }] })
  })
  it('messages loaded before the flag was known are decoded when it arrives; the same array otherwise', () => {
    const msg = (content: string): ChatMessage =>
      ({ id: 'm', role: 'user', blocks: [{ id: 'b', type: 'text', content }], timestamp: new Date() }) as ChatMessage
    const loaded = [msg(c), msg('plain')]
    const decoded = decodeStoredRefs(loaded)
    expect(decoded[0].blocks[0].content).toBe('x')
    expect(decoded[0].refs).toEqual([{ kind: 'plan', id: U }])
    expect(decoded[1]).toBe(loaded[1])
    const plain = [msg('plain')]
    expect(decodeStoredRefs(plain)).toBe(plain)
  })
})

describe('B2 - refs_resolved is bound to its message, in send order', () => {
  const user = (refs?: { kind: 'plan' | 'task'; id: string; resolution?: 'ok' }[]) =>
    ({ role: 'user', refs }) as { role: string; refs?: { kind: 'plan' | 'task'; id: string; resolution?: 'ok' }[] }
  const plan = { kind: 'plan' as const, id: U }
  const resolvedPlan = [{ ...plan, status: 'ok' as const, label: 'P' }]

  it('goes to the oldest message still waiting, never to a later one', () => {
    const msgs = [user([{ ...plan }]), user([{ ...plan }])]
    const first = bindResolvedRefs(msgs, resolvedPlan)
    expect(first.index).toBe(0)
    const second = bindResolvedRefs(first.messages, resolvedPlan)
    expect(second.index).toBe(1)
  })
  it('never touches a message without refs, and drops an event that matches nothing', () => {
    const msgs = [user(), user([{ kind: 'task', id: V }])]
    const r = bindResolvedRefs(msgs, resolvedPlan)
    expect(r.index).toBe(-1)
    expect(r.messages).toBe(msgs)
  })
  it('skips a message that was already answered', () => {
    const msgs = [user([{ ...plan, resolution: 'ok' }]), user([{ ...plan }])]
    expect(bindResolvedRefs(msgs, resolvedPlan).index).toBe(1)
  })
  it('counts the distinct tokens of a text', () => {
    expect(countRefTokens(`#plan:${U} #plan:${U} #task:${V}`)).toBe(2)
  })
})
