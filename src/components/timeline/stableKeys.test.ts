/**
 * Keys of the trace through the production path: raw history events, as the REST route
 * serves them (`created_at` in seconds, injected by the server), assembled by the same
 * reducers the chat uses — never blocks dated by hand.
 */
import { describe, expect, it } from 'vitest'
import { historyEventsToMessages, historyEventsToWindow } from '@/utils/chatAssembly'
import type { ChatMessage } from '@/types'
import { adoptTranscriptIds, buildConversationTimeline } from './conversation'
import { buildTimeline } from './model'

const T = 1_791_000_000
const relay = { type: 'conversation_relayed', from_session_id: 'old', to_session_id: 'root', from_provider: 'native', to_provider: 'claude-code', relayed_entries: 4, omitted_entries: 0 }
/** What `GET /chat/sessions/:id/messages` returns for a turn with an error, a model change, a compaction and a relay. */
function served(prefix: string, extra: Record<string, unknown>[] = []) {
  const events: Record<string, unknown>[] = [
    { type: 'user_message', content: 'go' },
    { type: 'error', message: 'rate limited' },
    { type: 'model_changed', model: 'claude-haiku-4-5', reason: 'cheaper' },
    { type: 'compact_boundary', trigger: 'auto', pre_tokens: 120000 },
    ...extra,
    { type: 'result', subtype: 'error_during_execution', result_text: 'stopped' },
  ]
  return events.map((e, seq) => ({ id: `${prefix}-${seq}`, seq, created_at: T + seq, ...e }))
}
const keysOf = (messages: ChatMessage[], sessionId = 'root') =>
  buildTimeline({ messages, sessionId }).items.filter((i) => i.kind === 'error' || i.kind === 'marker').map((i) => i.id)

describe('trace keys through the reducers', () => {
  it('the transcript (window reducer) and the history (trace reducer) give an error, a model change, a compaction and a relay the same key', () => {
    const events = served('r', [relay])
    const transcript = keysOf(historyEventsToWindow(events).messages)
    const trace = keysOf(historyEventsToMessages(events))
    expect(transcript).toHaveLength(5)
    expect(trace).toEqual(transcript)
    // Not the assembler's random block ids.
    expect(trace.every((k) => k.includes('@'))).toBe(true)
  })

  it('a relay appears in BOTH sessions\' histories: each lane keeps its own marker', () => {
    const root = historyEventsToMessages(served('r', [relay]))
    const old = historyEventsToMessages(served('o', [relay]))
    const { lanes } = buildConversationTimeline({
      rootId: 'root',
      sessions: [
        { id: 'old', title: 'Before', relation: 'relay', isStreaming: false, messages: old },
        { id: 'root', title: 'Now', relation: 'root', isStreaming: false, messages: root },
      ],
    })
    const markers = lanes.flatMap((l) => l.items.filter((i) => i.kind === 'marker' && i.label.includes('native')).map((i) => i.id))
    expect(markers).toHaveLength(2)
    expect(new Set(markers).size).toBe(2)
  })
})

describe('turns sent from this tab', () => {
  it('keep the transcript\'s client id once the history (server ids) takes over', () => {
    const history = historyEventsToMessages(served('r'))
    const live: ChatMessage = { id: 'm-1-client', role: 'user', timestamp: new Date(T * 1000), blocks: [{ id: 'b', type: 'text', content: 'go' }] }
    const adopted = adoptTranscriptIds(history, [live])
    expect(buildTimeline({ messages: [...adopted], sessionId: 'root' }).items[0]?.id).toBe('request:m-1-client')
    // Nothing to adopt: the same array.
    expect(adoptTranscriptIds(history, historyEventsToWindow(served('r')).messages)).toBe(history)
  })
})

describe('turns of a window centred on an older turn (a search result)', () => {
  it('never hands one turn the id of another: three turns, three request rows, each with its own call', () => {
    // ok (s1) · other (s2) · ok (s3): two turns with the same text.
    const turn = (text: string, call: string, at: number) => [
      { type: 'user_message', content: text, created_at: at },
      { type: 'tool_use', id: call, tool: 'Bash', input: { command: call }, created_at: at + 1 },
      { type: 'tool_result', id: call, result: 'ok', created_at: at + 2 },
      { type: 'result', duration_ms: 2000, created_at: at + 3 },
    ]
    const events = [...turn('ok', 'c1', T), ...turn('other', 'c2', T + 10), ...turn('ok', 'c3', T + 20)]
      .map((e, seq) => ({ ...e, seq, ...(e.type === 'user_message' ? { id: `s${seq / 4 + 1}` } : {}) }))
    // The transcript: the window around s1 only (it came from the history: server ids).
    const transcript = historyEventsToWindow(events.slice(0, 4)).messages
    const history = historyEventsToMessages(events)
    const adopted = adoptTranscriptIds(history, transcript)
    expect(adopted).toBe(history)

    const { items } = buildTimeline({ messages: [...adopted], sessionId: 'root' })
    const requests = items.filter((i) => i.kind === 'request')
    expect(requests.map((r) => r.id)).toEqual(['request:s1', 'request:s2', 'request:s3'])
    const parentOf = (call: string) => items.find((i) => i.id === call)?.parentId
    expect([parentOf('c1'), parentOf('c2'), parentOf('c3')]).toEqual(['request:s1', 'request:s2', 'request:s3'])
  })

  it('adopts a client id once, and only for a turn the transcript does not already hold', () => {
    const user = (id: string, content: string): ChatMessage => ({ id, role: 'user', timestamp: new Date(T * 1000), blocks: [{ id: `${id}-b`, type: 'text', content }] })
    const history = [user('s1', 'ok'), user('s2', 'other'), user('s3', 'ok')]
    // The transcript holds s1 (server id) and a live turn "ok" (client id): only s3 takes it.
    const adopted = adoptTranscriptIds(history, [user('s1', 'ok'), user('m-live', 'ok')])
    expect(adopted.map((m) => m.id)).toEqual(['s1', 's2', 'm-live'])
    // A client id is never given twice, nor an id the history already carries.
    expect(adoptTranscriptIds(history, [user('s3', 'ok')])).toBe(history)
  })
})
