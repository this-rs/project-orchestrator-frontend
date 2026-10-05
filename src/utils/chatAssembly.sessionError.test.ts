/**
 * `session_error` is emitted by the backend when the CLI subprocess dies
 * (`emit_subprocess_death`). It is typed in `ChatEvent` but had no arm in
 * the reducers: the death of the CLI was invisible in the conversation.
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages } from './chatAssembly'

describe('historyEventsToMessages — session_error', () => {
  const events = [
    { type: 'user_message', content: 'hello', created_at: 1_700_000_000 },
    { type: 'assistant_text', content: 'working…', created_at: 1_700_000_001 },
    {
      type: 'session_error',
      reason: 'subprocess_died',
      message: 'The Claude CLI process exited unexpectedly',
      received_at: '2026-10-02T10:00:00Z',
      created_at: 1_700_000_002,
    },
  ]

  it('renders the death of the CLI as an error block, with its reason', () => {
    const messages = historyEventsToMessages(events)
    const blocks = messages.flatMap((m) => m.blocks)
    const err = blocks.find((b) => b.type === 'error')
    expect(err).toBeDefined()
    expect(err!.content).toContain('The Claude CLI process exited unexpectedly')
    expect(err!.content).toContain('subprocess_died')
  })

  it('keeps the error inside the assistant turn it interrupted', () => {
    const messages = historyEventsToMessages(events)
    const assistant = messages.filter((m) => m.role === 'assistant')
    expect(assistant).toHaveLength(1)
    expect(assistant[0].blocks.map((b) => b.type)).toEqual(['text', 'error'])
  })
})

describe('historyEventsToMessages — an agent session resumed without the agent engine', () => {
  it('keeps the typed code, so the transcript shows the provider card, not a bare sentence', () => {
    const messages = historyEventsToMessages([
      { type: 'user_message', content: 'hello', created_at: 1_700_000_000 },
      {
        type: 'session_error',
        reason: 'provider_unavailable',
        message: 'The agent engine is not enabled on this server',
        code: 'provider_unavailable',
        received_at: '2026-10-05T10:00:00Z',
        created_at: 1_700_000_002,
      },
    ])
    const err = messages.flatMap((m) => m.blocks).find((b) => b.type === 'error')
    expect(err?.metadata).toMatchObject({ code: 'provider_unavailable' })
  })
})
