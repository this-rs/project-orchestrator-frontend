/**
 * References in the REPLAY path: the stored `user_message` carries the
 * `<po-refs>` block, `refs_resolved` follows it. Same vectors as the live path
 * (`hooks/__tests__/useChat.refs.test.tsx`), same expected messages.
 */
import { describe, expect, it } from 'vitest'
import block from '@/refs/__fixtures__/po_refs_block.json'
import resolved from '@/refs/__fixtures__/refs_resolved_event.json'
import { historyEventsToMessages } from './chatAssembly'

const w = block.with_attachments
const two = block.cases[1]

describe('historyEventsToMessages — references', () => {
  it('shows the visible text, the refs and the attachments of a message that carries both blocks', () => {
    const [m] = historyEventsToMessages([{ type: 'user_message', content: w.encoded }])
    expect(m.blocks[0].content).toBe(w.text)
    expect(m.refs).toEqual(w.refs)
    expect(m.attachments).toEqual(w.attachments)
  })

  it('leaves no refs field on a message without a block', () => {
    const [m] = historyEventsToMessages([{ type: 'user_message', content: 'bonjour' }])
    expect('refs' in m).toBe(false)
  })

  it('binds refs_resolved to the LAST user message before it, not to an earlier one', () => {
    const msgs = historyEventsToMessages([
      { type: 'user_message', content: two.encoded },
      { type: 'refs_resolved', refs: resolved.event.refs },
      { type: 'assistant_text', content: 'ok' },
      { type: 'user_message', content: 'plain follow-up' },
      { type: 'assistant_text', content: 'ok 2' },
    ])
    const users = msgs.filter((m) => m.role === 'user')
    expect(users[0].refs?.map((r) => [r.kind, r.resolution])).toEqual([
      ['plan', 'ok'],
      ['rfc', 'truncated'],
      ['task', 'not_found'],
      ['note', 'forbidden'],
    ])
    expect(users[0].refs?.[0].label).toBe('Chat : références #/@')
    expect(users[1].refs).toBeUndefined()
  })

  it('reads the payload nested under data (the replay shape) and ignores an event with no usable entry', () => {
    const nested = historyEventsToMessages([
      { type: 'user_message', content: two.encoded },
      { type: 'refs_resolved', data: { refs: resolved.event.refs } },
    ])
    expect(nested[0].refs?.[0].resolution).toBe('ok')
    const empty = historyEventsToMessages([
      { type: 'user_message', content: two.encoded },
      { type: 'refs_resolved', refs: [{ kind: 'persona', id: 'x', status: 'ok' }] },
    ])
    expect(empty[0].refs?.[0].resolution).toBeUndefined()
  })

  it('does nothing for a refs_resolved with no user message before it', () => {
    expect(historyEventsToMessages([{ type: 'refs_resolved', refs: resolved.event.refs }])).toEqual([])
  })
})
