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
