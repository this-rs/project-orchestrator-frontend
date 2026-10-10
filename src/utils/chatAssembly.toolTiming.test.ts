/**
 * `tool_timing` (backend T2): when a tool call really ran, as the engine saw it. It
 * is not a message: it lands on the `tool_use` block of its call, where the trace
 * reads it, and it changes nothing else in the conversation.
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages } from './chatAssembly'

const timing = {
  type: 'tool_timing',
  id: 't1',
  started_at: 1_700_000_001.25,
  permission_requested_at: 1_700_000_001.5,
  permission_resolved_at: 1_700_000_008,
  permission_outcome: 'allowed',
  run_started_at: 1_700_000_008,
  ended_at: 1_700_000_009.5,
  created_at: 1_700_000_009.6,
}

describe('historyEventsToMessages — tool_timing', () => {
  it('puts the timing on the tool_use block of its call and adds no block', () => {
    const base = [
      { type: 'user_message', content: 'list', created_at: 1_700_000_000 },
      { type: 'tool_use', id: 't1', tool: 'Bash', input: { command: 'ls' }, created_at: 1_700_000_001 },
      { type: 'tool_result', id: 't1', result: 'a.rs', created_at: 1_700_000_009.5 },
    ]
    const without = historyEventsToMessages(base)
    const withTiming = historyEventsToMessages([...base, timing])
    expect(withTiming.map((m) => m.blocks.length)).toEqual(without.map((m) => m.blocks.length))
    const use = withTiming.flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')
    expect(use?.metadata?.tool_timing).toEqual({
      started_at: 1_700_000_001.25,
      permission_requested_at: 1_700_000_001.5,
      permission_resolved_at: 1_700_000_008,
      permission_outcome: 'allowed',
      run_started_at: 1_700_000_008,
      ended_at: 1_700_000_009.5,
    })
  })

  it('does not break the max-turns "Continue" indicator it may follow', () => {
    const events = [
      { type: 'user_message', content: 'go', created_at: 1_700_000_000 },
      { type: 'tool_use', id: 't1', tool: 'Bash', input: {}, created_at: 1_700_000_001 },
      { type: 'tool_result', id: 't1', result: 'ok', created_at: 1_700_000_002 },
      { type: 'result', session_id: 's', duration_ms: 1, subtype: 'error_max_turns', created_at: 1_700_000_003 },
      { ...timing, ended_at: 1_700_000_002 },
      { type: 'user_message', content: 'Continue', created_at: 1_700_000_004 },
    ]
    const without = historyEventsToMessages(events.filter((e) => e.type !== 'tool_timing'))
    const withTiming = historyEventsToMessages(events)
    // Same conversation either way: the timing did not turn "Continue" into a user message.
    expect(withTiming.map((m) => m.role)).toEqual(without.map((m) => m.role))
    expect(withTiming.filter((m) => m.role === 'user').map((m) => m.blocks[0]?.content)).not.toContain('Continue')
  })
})
