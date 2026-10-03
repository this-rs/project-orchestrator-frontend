/**
 * `tools_cancelled` is emitted by the backend (`cancel_running_tools`) when running tool
 * processes are killed. It was typed in `ChatEvent` but had no arm in the reducers, so the
 * cancellation left no trace in the conversation.
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages, toolsCancelledText } from './chatAssembly'

describe('historyEventsToMessages — tools_cancelled', () => {
  const events = [
    { type: 'user_message', content: 'run it', created_at: 1_700_000_000 },
    { type: 'assistant_text', content: 'running…', created_at: 1_700_000_001 },
    { type: 'tools_cancelled', killed_count: 2, requested_by: 'user', created_at: 1_700_000_002 },
  ]

  it('renders the cancellation inside the assistant turn it interrupted', () => {
    const assistant = historyEventsToMessages(events).filter((m) => m.role === 'assistant')
    expect(assistant).toHaveLength(1)
    const err = assistant[0].blocks.find((b) => b.type === 'error')
    expect(err?.content).toContain('2 running tool processes')
    expect(err?.content).toContain('user')
  })

  it('words the singular and a missing requester', () => {
    expect(toolsCancelledText({ killed_count: 1 })).toBe('Cancelled 1 running tool process')
  })
})
