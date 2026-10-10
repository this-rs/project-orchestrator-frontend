/**
 * `tool_timing` (backend T2): when a tool call really ran, as the engine saw it. It
 * is not a message: it lands on the `tool_use` block of its call, where the trace
 * reads it, and it changes nothing else in the conversation.
 */
import { describe, it, expect } from 'vitest'
import { EARLY_TOOL_TIMINGS_MAX, EarlyToolTimings, historyEventsToMessages } from './chatAssembly'

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

  it('keeps a timing stored before its tool_use and puts it on the call when it comes', () => {
    const events = [
      { type: 'user_message', content: 'list', created_at: 1_700_000_000 },
      timing,
      { type: 'tool_use', id: 't1', tool: 'Bash', input: { command: 'ls' }, created_at: 1_700_000_001 },
      { type: 'tool_result', id: 't1', result: 'a.rs', created_at: 1_700_000_009.5 },
    ]
    const use = historyEventsToMessages(events).flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')
    expect(use?.metadata?.tool_timing).toMatchObject({ run_started_at: 1_700_000_008, ended_at: 1_700_000_009.5 })
  })

  it('a timing received twice gives the same conversation as once', () => {
    const base = [
      { type: 'user_message', content: 'list', created_at: 1_700_000_000 },
      { type: 'tool_use', id: 't1', tool: 'Bash', input: { command: 'ls' }, created_at: 1_700_000_001 },
      { type: 'tool_result', id: 't1', result: 'a.rs', created_at: 1_700_000_009.5 },
    ]
    const strip = (msgs: ReturnType<typeof historyEventsToMessages>) => msgs.map((m) => m.blocks.map((b) => [b.type, b.content, b.metadata]))
    expect(strip(historyEventsToMessages([...base, timing, timing]))).toEqual(strip(historyEventsToMessages([...base, timing])))
  })

  it('drops a timing still waiting for its call when the turn ends', () => {
    const events = [
      { type: 'user_message', content: 'go', created_at: 1_700_000_000 },
      timing,
      { type: 'result', session_id: 's', duration_ms: 1, created_at: 1_700_000_002 },
      { type: 'user_message', content: 'again', created_at: 1_700_000_010 },
      { type: 'tool_use', id: 't1', tool: 'Bash', input: {}, created_at: 1_700_000_011 },
    ]
    const use = historyEventsToMessages(events).flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')
    expect(use?.metadata).not.toHaveProperty('tool_timing')
  })
})

describe('EarlyToolTimings', () => {
  it('holds at most EARLY_TOOL_TIMINGS_MAX timings, dropping the oldest', () => {
    const held = new EarlyToolTimings()
    for (let i = 0; i <= EARLY_TOOL_TIMINGS_MAX; i++) held.hold({ type: 'tool_timing', id: `t${i}`, ended_at: i })
    expect(held.size).toBe(EARLY_TOOL_TIMINGS_MAX)
    expect(held.take('t0')).toBeUndefined()
    expect(held.take(`t${EARLY_TOOL_TIMINGS_MAX}`)).toEqual({ ended_at: EARLY_TOOL_TIMINGS_MAX })
  })

  it('ignores what is not a timing, keeps the latest of an id, and gives a timing once', () => {
    const held = new EarlyToolTimings()
    held.hold({ type: 'tool_timing', id: 'x' })
    expect(held.size).toBe(0)
    held.hold({ type: 'tool_timing', id: 'x', ended_at: 1 })
    held.hold({ type: 'tool_timing', id: 'x', ended_at: 2 })
    expect(held.size).toBe(1)
    expect(held.take('x')).toEqual({ ended_at: 2 })
    expect(held.take('x')).toBeUndefined()
  })
})
