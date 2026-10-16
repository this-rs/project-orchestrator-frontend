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
    const [m] = historyEventsToMessages([{ type: 'user_message', content: w.encoded }], { refsEnabled: true })
    expect(m.blocks[0].content).toBe(w.text)
    expect(m.refs).toEqual(w.refs)
    expect(m.attachments).toEqual(w.attachments)
  })

  it('without refs_v1 a stored block stays in the text: nothing is hidden, nothing decoded', () => {
    const [m] = historyEventsToMessages([{ type: 'user_message', content: w.encoded }])
    expect(m.blocks[0].content).toBe(w.encoded.replace(/\n\n<po-attachments>[\s\S]*$/, ''))
    expect('refs' in m).toBe(false)
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
    ], { refsEnabled: true })
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
    ], { refsEnabled: true })
    expect(nested[0].refs?.[0].resolution).toBe('ok')
    const empty = historyEventsToMessages([
      { type: 'user_message', content: two.encoded },
      { type: 'refs_resolved', refs: [{ kind: 'persona', id: 'x', status: 'ok' }] },
    ], { refsEnabled: true })
    expect(empty[0].refs?.[0].resolution).toBeUndefined()
  })

  it('does nothing for a refs_resolved with no user message before it', () => {
    expect(historyEventsToMessages([{ type: 'refs_resolved', refs: resolved.event.refs }])).toEqual([])
  })
})

describe('historyEventsToMessages — the citations of the answer', () => {
  const ghost = { kind: 'plan', id: '9f1e0a10-0000-4000-8000-00000000dead', status: 'not_found' }
  const read = { kind: 'task', id: '3adeffc9-c8b0-4e2f-a674-55bfcb293433', status: 'ok', label: 'Tâche alpha' }

  it('binds cites_resolved to the LAST assistant message, keeping the status of each citation', () => {
    const msgs = historyEventsToMessages([
      { type: 'user_message', content: 'bonjour' },
      { type: 'assistant_text', content: `voir #plan:${ghost.id}` },
      { type: 'cites_resolved', refs: [ghost, read] },
    ])
    const answer = msgs[msgs.length - 1]
    expect(answer.role).toBe('assistant')
    expect(answer.cited?.map((r) => [r.kind, r.resolution])).toEqual([
      ['plan', 'not_found'],
      ['task', 'ok'],
    ])
    expect(answer.cited?.[0].label).toBeUndefined()
    expect(answer.cited?.[1].label).toBe('Tâche alpha')
  })

  it('reads the payload nested under data (the replay shape) and drops an event with no answer before it', () => {
    const nested = historyEventsToMessages([
      { type: 'assistant_text', content: 'ok' },
      { type: 'cites_resolved', data: { refs: [ghost] } },
    ])
    expect(nested[nested.length - 1].cited?.[0].resolution).toBe('not_found')
    expect(historyEventsToMessages([{ type: 'cites_resolved', refs: [ghost] }])).toEqual([])
    expect(historyEventsToMessages([{ type: 'assistant_text', content: 'ok' }, { type: 'cites_resolved', refs: [] }])[0].cited).toBeUndefined()
  })
})
