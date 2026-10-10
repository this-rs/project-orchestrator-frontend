/**
 * `tool_timing` (backend T2): when a tool call really ran, as the engine saw it. It
 * is not a message: it lands on the `tool_use` block of its call, where the trace
 * reads it, and it changes nothing else in the conversation.
 */
import { describe, it, expect } from 'vitest'
import { EARLY_TOOL_TIMINGS_MAX, EarlyToolTimings, ServerClock, historyEventsToMessages, historyEventsToWindow } from './chatAssembly'
import { buildTimeline } from '@/components/timeline/model'

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

describe('history pages — a timing whose call is on an older page', () => {
  // Raw events of one conversation, cut in two pages between the call and its timing.
  const events = [
    { type: 'user_message', content: 'build', created_at: 1_700_000_000 },
    { type: 'tool_use', id: 't1', tool: 'Bash', input: { command: 'make' }, created_at: 1_700_000_001 },
    // ---- page boundary ----
    { type: 'tool_result', id: 't1', result: 'ok', created_at: 1_700_000_009.5 },
    timing,
    { type: 'result', session_id: 's', duration_ms: 9500, created_at: 1_700_000_010 },
  ]
  const olderPage = events.slice(0, 2)
  const tailPage = events.slice(2)

  it('the tail page returns the timing it could not place, and the older page takes it when it comes', () => {
    const tail = historyEventsToWindow(tailPage)
    expect(tail.unplacedTimings.size).toBe(1)
    const older = historyEventsToWindow(olderPage)
    tail.unplacedTimings.placeIn(older.messages)
    expect(tail.unplacedTimings.size).toBe(0)
    const all = [...older.messages, ...tail.messages]
    const whole = historyEventsToMessages(events)
    const use = (msgs: typeof all) => msgs.flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')?.metadata?.tool_timing
    // The same timing as when both are in one page, and the trace draws the same run.
    expect(use(all)).toEqual(use(whole))
    const runOf = (msgs: typeof all) => buildTimeline({ messages: msgs, sessionId: 's' }).items.find((i) => i.id === 't1')
    expect(runOf(all)).toMatchObject({ startedAt: 1_700_000_008_000, endedAt: 1_700_000_009_500, run: 'ran' })
  })

  it('a timing placed in its page is not returned', () => {
    expect(historyEventsToWindow(events).unplacedTimings.size).toBe(0)
  })

  it('placedOn places without changing the messages or the holder', () => {
    const tail = historyEventsToWindow(tailPage)
    const older = historyEventsToWindow(olderPage)
    const before = older.messages
    const placed = tail.unplacedTimings.placedOn(before)
    expect(placed).not.toBe(before)
    expect(before.flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')?.metadata).not.toHaveProperty('tool_timing')
    expect(placed.flatMap((m) => m.blocks).find((b) => b.type === 'tool_use')?.metadata?.tool_timing).toMatchObject({ ended_at: 1_700_000_009.5 })
    expect(tail.unplacedTimings.size).toBe(1)
  })
})

describe('historyEventsToMessages — permission time', () => {
  it('stamps a permission (and a question) with its own time, not the time of the message it joins', () => {
    const msgs = historyEventsToMessages([
      { type: 'user_message', content: 'go', created_at: 1_700_000_000 },
      { type: 'tool_use', id: 't1', tool: 'Bash', input: {}, created_at: 1_700_000_001 },
      { type: 'permission_request', id: 'ctl-1', tool: 'Bash', input: {}, tool_use_id: 't1', created_at: 1_700_000_005 },
      { type: 'ask_user_question', tool_call_id: 'q1', questions: [{ question: 'Which?' }], created_at: 1_700_000_006 },
    ])
    const blocks = msgs.flatMap((m) => m.blocks)
    expect(blocks.find((b) => b.type === 'permission_request')?.metadata?.created_at).toBe(new Date(1_700_000_005_000).toISOString())
    expect(blocks.find((b) => b.type === 'ask_user_question')?.metadata?.created_at).toBe(new Date(1_700_000_006_000).toISOString())
  })
})

describe('ServerClock', () => {
  it('learns the gap from a live frame, ignores a replayed one, and gives the server time', () => {
    const clock = new ServerClock()
    const browser = Date.now()
    expect(Math.abs(clock.now().getTime() - browser)).toBeLessThan(1000)
    clock.observe({ type: 'tool_use', created_at: (browser - 3_600_000) / 1000 })
    expect(Math.abs(clock.offset + 3_600_000)).toBeLessThan(1000)
    clock.observe({ type: 'tool_use', replaying: true, created_at: (browser - 86_400_000) / 1000 })
    clock.observe({ type: 'streaming_status', is_streaming: true })
    expect(Math.abs(clock.now().getTime() - (browser - 3_600_000))).toBeLessThan(1000)
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
