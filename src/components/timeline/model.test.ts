import { describe, expect, it } from 'vitest'
import type { ChatMessage, ContentBlock } from '@/types'
import { buildTimeline, chainOf } from './model'

const at = (s: number) => new Date(Date.UTC(2026, 9, 8, 12, 0, s))
const iso = (s: number) => at(s).toISOString()

const user = (id: string, text: string, s: number): ChatMessage => ({
  id, role: 'user', timestamp: at(s), blocks: [{ id: `${id}-b`, type: 'text', content: text }],
})
const assistant = (id: string, blocks: ContentBlock[], s: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, role: 'assistant', timestamp: at(s), blocks, ...extra,
})
const toolUse = (callId: string, name: string, input: Record<string, unknown>, s: number, parent?: string): ContentBlock => ({
  id: `u-${callId}`, type: 'tool_use', content: name,
  metadata: { tool_call_id: callId, tool_name: name, tool_input: input, created_at: iso(s), ...(parent && { parent_tool_use_id: parent }) },
})
const toolResult = (callId: string, s: number, extra: Record<string, unknown> = {}): ContentBlock => ({
  id: `r-${callId}`, type: 'tool_result', content: 'ok', metadata: { tool_call_id: callId, created_at: iso(s), ...extra },
})

describe('buildTimeline', () => {
  it('draws a call from the run the engine saw (tool_timing) when there is one, not from the announcement', () => {
    const t0 = at(0).getTime() / 1000
    const waited = { ...toolUse('w', 'Bash', { command: 'ls' }, 1), metadata: { ...toolUse('w', 'Bash', { command: 'ls' }, 1).metadata, tool_timing: { permission_requested_at: t0 + 1.2, permission_resolved_at: t0 + 9.25, run_started_at: t0 + 9.25, ended_at: t0 + 9.5 } } }
    const denied = { ...toolUse('d', 'Bash', { command: 'rm' }, 10), metadata: { ...toolUse('d', 'Bash', { command: 'rm' }, 10).metadata, tool_timing: { permission_outcome: 'denied', ended_at: t0 + 12 } } }
    const msgs = [user('m1', 'go', 0), assistant('m2', [waited, toolResult('w', 20), denied, toolResult('d', 20, { is_error: true })], 1)]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
    expect(items.find((i) => i.id === 'w')).toMatchObject({ startedAt: at(9).getTime() + 250, endedAt: at(9).getTime() + 500, durationMs: 250 })
    // No run start seen (denied): the call keeps its announced start, and ends when the engine said.
    expect(items.find((i) => i.id === 'd')).toMatchObject({ startedAt: at(10).getTime(), endedAt: at(12).getTime(), durationMs: 2000 })
  })

  describe('tool_timing', () => {
    const t0 = at(0).getTime() / 1000
    const timed = (callId: string, s: number, timing: Record<string, unknown>, name = 'Bash'): ContentBlock => {
      const block = toolUse(callId, name, { command: callId }, s)
      return { ...block, metadata: { ...block.metadata, tool_timing: timing } }
    }
    const callIn = (msgs: ChatMessage[], id: string) => buildTimeline({ messages: msgs, sessionId: 's' }).items.find((i) => i.id === id)

    it('does not draw a denied call as a run, even with a run start on it (older backend)', () => {
      // Backend #668 sends run_started_at = the answer on a denied call.
      const denied = timed('d', 1, { permission_requested_at: t0 + 1.5, permission_resolved_at: t0 + 8, permission_outcome: 'denied', run_started_at: t0 + 8, ended_at: t0 + 8.01 })
      const item = callIn([user('m1', 'go', 0), assistant('m2', [denied, toolResult('d', 9, { is_error: true })], 1)], 'd')
      expect(item).toMatchObject({ startedAt: at(1).getTime(), endedAt: at(8).getTime() + 10, run: 'denied' })
    })

    it('treats a missing run start as "never ran": from the engine announcement to the end, both server times', () => {
      // The block was stamped by a browser clock 5 s ahead; the engine's called_at is the server's.
      // The engine took the call up (started_at) but did not see it start: that is worth a note.
      const unseen = timed('u', 6, { called_at: t0 + 1, started_at: t0 + 1.1, ended_at: t0 + 3 })
      const item = callIn([user('m1', 'go', 0), assistant('m2', [unseen, toolResult('u', 9)], 1)], 'u')
      expect(item).toMatchObject({ startedAt: at(1).getTime(), endedAt: at(3).getTime(), durationMs: 2000, run: 'unseen' })
    })

    it('says nothing of an unseen start when it is the normal case: no hook, a question, an unanswered permission, an incomplete timing', () => {
      const noHook = timed('h', 6, { called_at: t0 + 1, ended_at: t0 + 3 })
      const question = timed('q', 1, { called_at: t0 + 1, started_at: t0 + 1.1, permission_requested_at: t0 + 1.2, ended_at: t0 + 3 }, 'AskUserQuestion')
      const unanswered = timed('n', 1, { called_at: t0 + 1, started_at: t0 + 1.1, permission_requested_at: t0 + 1.2, ended_at: t0 + 3, cancelled: true })
      const partial = timed('p', 1, { called_at: t0 + 1, started_at: t0 + 1.1, ended_at: t0 + 3, incomplete: true })
      const msgs = [user('m1', 'go', 0), assistant('m2', [noHook, toolResult('h', 9), question, toolResult('q', 9), unanswered, toolResult('n', 9, { is_cancelled: true }), partial, toolResult('p', 9)], 1)]
      const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
      for (const id of ['h', 'q', 'n', 'p']) expect(items.find((i) => i.id === id)?.run, id).toBeUndefined()
      // Still drawn from the engine's times.
      expect(items.find((i) => i.id === 'h')).toMatchObject({ startedAt: at(1).getTime(), endedAt: at(3).getTime() })
    })

    it('shows a denied call as cancelled, not failed: it never ran', () => {
      const denied = timed('d', 1, { permission_requested_at: t0 + 1.5, permission_resolved_at: t0 + 8, permission_outcome: 'denied', ended_at: t0 + 8.01 })
      const item = callIn([user('m1', 'go', 0), assistant('m2', [denied, toolResult('d', 9, { is_error: true })], 1)], 'd')
      expect(item).toMatchObject({ status: 'cancelled', run: 'denied' })
    })

    it('leaves a permission under its call while the engine has not dated the wait (no timing yet)', () => {
      // The block's own time is before the call's (a permission stamped at the message start):
      // with no `permission_requested_at`, it is not comparable with the call and stays under it.
      const call = toolUse('a', 'Bash', { command: 'ls' }, 5)
      const ask: ContentBlock = { id: 'p-a', type: 'permission_request', content: 'Bash wants to run', metadata: { tool_call_id: 'ctl-1', tool_use_id: 'a', created_at: iso(1) } }
      const { items } = buildTimeline({ messages: [user('m1', 'go', 0), assistant('m2', [call, ask], 1)], sessionId: 's', isStreaming: true })
      expect(items.find((i) => i.kind === 'permission')).toMatchObject({ parentId: 'a', startedAt: at(1).getTime(), status: 'blocked' })
    })

    it('gives no duration (not a 0 ms bar) to a call without run start whose end is before its start (clock skew)', () => {
      const skewed = timed('k', 6, { ended_at: t0 + 3 })
      const item = callIn([user('m1', 'go', 0), assistant('m2', [skewed, toolResult('k', 9)], 1)], 'k')
      expect(item?.startedAt).toBe(at(6).getTime())
      expect(item?.endedAt).toBeUndefined()
      expect(item?.durationMs).toBeUndefined()
    })

    it('draws a call without permission from its run start to its end', () => {
      const plain = timed('p', 1, { called_at: t0 + 1, started_at: t0 + 1.1, run_started_at: t0 + 1.1, ended_at: t0 + 1.6 })
      const { items } = buildTimeline({ messages: [user('m1', 'go', 0), assistant('m2', [plain, toolResult('p', 2)], 1)], sessionId: 's' })
      expect(items.find((i) => i.id === 'p')).toMatchObject({ startedAt: at(1).getTime() + 100, endedAt: at(1).getTime() + 600, durationMs: 500, run: 'ran', status: 'done' })
      expect(items.some((i) => i.kind === 'permission')).toBe(false)
    })

    it('draws a cancelled call from its run start to the cancellation', () => {
      const cancelled = timed('c', 1, { run_started_at: t0 + 2, ended_at: t0 + 7, cancelled: true })
      const item = callIn([user('m1', 'go', 0), assistant('m2', [cancelled, toolResult('c', 7, { is_cancelled: true })], 1)], 'c')
      expect(item).toMatchObject({ status: 'cancelled', startedAt: at(2).getTime(), endedAt: at(7).getTime(), durationMs: 5000, run: 'ran' })
    })

    it('marks a timing the engine says is incomplete', () => {
      const partial = timed('i', 1, { run_started_at: t0 + 1, ended_at: t0 + 2, incomplete: true })
      expect(callIn([user('m1', 'go', 0), assistant('m2', [partial, toolResult('i', 2)], 1)], 'i')?.timingIncomplete).toBe(true)
      const whole = timed('w', 1, { run_started_at: t0 + 1, ended_at: t0 + 2 })
      expect(callIn([user('m1', 'go', 0), assistant('m2', [whole, toolResult('w', 2)], 1)], 'w')?.timingIncomplete).toBeUndefined()
    })

    it('gives the permission the wait the engine measured, and never starts it before the span it hangs from', () => {
      const call = timed('a', 1, { permission_requested_at: t0 + 1.5, permission_resolved_at: t0 + 8, permission_outcome: 'allowed', run_started_at: t0 + 8, ended_at: t0 + 9 })
      const ask: ContentBlock = { id: 'p-a', type: 'permission_request', content: 'Bash wants to run', metadata: { tool_call_id: 'ctl-1', tool_use_id: 'a', decided: true, decision: 'allowed', created_at: iso(2) } }
      const { items } = buildTimeline({ messages: [user('m1', 'go', 0), assistant('m2', [call, ask, toolResult('a', 9)], 1)], sessionId: 's' })
      const permission = items.find((i) => i.kind === 'permission')
      expect(permission).toMatchObject({ startedAt: at(1).getTime() + 500, endedAt: at(8).getTime(), durationMs: 6500, anchorId: 'a', status: 'done' })
      const parent = items.find((i) => i.id === permission?.parentId)
      expect(parent).toBeDefined()
      expect(parent!.startedAt).toBeLessThanOrEqual(permission!.startedAt)
      expect(permission?.parentId).toBe('request:m1')
    })

    it('ends a turn no earlier than the engine said its call ended', () => {
      const late = timed('l', 1, { run_started_at: t0 + 1, ended_at: t0 + 30 })
      const msgs = [user('m1', 'go', 0), assistant('m2', [late, toolResult('l', 2)], 1), user('m3', 'next', 60)]
      expect(buildTimeline({ messages: msgs, sessionId: 's' }).items.find((i) => i.id === 'request:m1')?.endedAt).toBe(at(30).getTime())
    })
  })

  it('marks a tool call without result as running while streaming, unknown (not done) once the turn ended', () => {
    const msgs = [user('m1', 'list files', 0), assistant('m2', [toolUse('t1', 'Bash', { command: 'ls' }, 1)], 1)]
    expect(buildTimeline({ messages: msgs, sessionId: 's', isStreaming: true }).items.find((i) => i.id === 't1')?.status).toBe('running')
    const ended = [msgs[0], { ...msgs[1], duration_ms: 900 }]
    expect(buildTimeline({ messages: ended, sessionId: 's', isStreaming: false }).items.find((i) => i.id === 't1')?.status).toBe('unknown')
  })

  it('reads error, cancellation and duration from the result', () => {
    const msgs = [
      user('m1', 'go', 0),
      assistant('m2', [
        toolUse('a', 'Read', { file_path: '/x' }, 1), toolResult('a', 3, { is_error: true, duration_ms: 2000 }),
        toolUse('b', 'Bash', { command: 'sleep' }, 4), toolResult('b', 5, { is_cancelled: true }),
      ], 1),
    ]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
    const a = items.find((i) => i.id === 'a')
    expect(a).toMatchObject({ status: 'error', durationMs: 2000, label: 'Read · /x' })
    expect(items.find((i) => i.id === 'b')?.status).toBe('cancelled')
  })

  it('traces every item back to the request of its turn', () => {
    const msgs = [
      user('m1', 'first', 0), assistant('m2', [toolUse('t1', 'Bash', { command: 'a' }, 1), toolResult('t1', 2)], 1, { duration_ms: 1 }),
      user('m3', 'second', 10), assistant('m4', [toolUse('t2', 'Task', { description: 'dig' }, 11), toolUse('t3', 'Grep', { pattern: 'x' }, 12, 't2')], 11),
    ]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
    expect(items.find((i) => i.id === 't1')?.requestId).toBe('request:m1')
    expect(items.find((i) => i.id === 't2')).toMatchObject({ kind: 'agent', requestId: 'request:m3', parentId: 'request:m3' })
    expect(items.find((i) => i.id === 't3')?.parentId).toBe('t2')
  })

  it('puts detached runs in their own lane and counts what runs', () => {
    const tl = buildTimeline({
      messages: [], sessionId: 's', title: 'Main',
      runs: [{ sessionId: 'c1', title: 'Wave 1', isStreaming: true, startedAt: iso(5) }],
    })
    expect(tl.lanes.map((l) => l.id)).toEqual(['s', 'c1'])
    expect(tl.runningCount).toBe(1)
    expect(tl.lanes[1].items[0]).toMatchObject({ kind: 'run', sessionId: 'c1' })
  })

  it('a permission waits until the assembler stamps the answer on it (its id is not the tool call id)', () => {
    const perm = (metadata: Record<string, unknown>): ContentBlock => ({ id: 'p', type: 'permission_request', content: 'Allow Bash?', metadata: { tool_call_id: 'ctl-1', created_at: iso(1), ...metadata } })
    const at = (m: Record<string, unknown>) => buildTimeline({ messages: [user('m1', 'x', 0), assistant('m2', [toolUse('t1', 'Bash', {}, 1), perm(m)], 1)], sessionId: 's', isStreaming: true }).items.find((i) => i.kind === 'permission')?.status
    expect(at({})).toBe('blocked')
    expect(at({ decided: true, decision: 'allowed' })).toBe('done')
    expect(at({ decided: true, decision: 'denied' })).toBe('cancelled')
  })
})

describe('chainOf', () => {
  it('returns the way up to the request and everything below', () => {
    const msgs = [
      user('m1', 'go', 0),
      assistant('m2', [toolUse('t2', 'Task', { description: 'dig' }, 1), toolUse('t3', 'Grep', {}, 2, 't2'), toolUse('t4', 'Read', {}, 3, 't3')], 1),
    ]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
    const mid = chainOf(items, 't3')
    expect(mid.upstream.map((i) => i.id)).toEqual(['request:m1', 't2'])
    expect(mid.downstream.map((i) => i.id)).toEqual(['t4'])
  })
})

import type { RoutingDecision } from '@/types/routing'

const decision = (over: Partial<RoutingDecision> = {}): RoutingDecision => ({
  id: 'd1', at: iso(0), mode: 'full', stage: 'active', applied: true, task_class: 'complex',
  provider_id: 'claude-code', model: 'claude-opus-4-1-20250805', score: 0.82, explored: false,
  reason: 'best reward per dollar', alternatives: [
    { provider_id: 'native', model: 'deepseek-chat', score: 0.61, rejected: null },
    { provider_id: 'codex', model: null, score: null, rejected: 'no_tools' },
  ], session_id: 's', ...over,
} as RoutingDecision)

describe('model and provider', () => {
  it('stamps the provider and model in force, and follows a model change', () => {
    const msgs = [
      user('m1', 'go', 0),
      assistant('m2', [
        toolUse('a', 'Bash', {}, 1),
        { id: 'mc', type: 'model_changed', content: 'Model changed to claude-haiku-4-5', metadata: { model: 'claude-haiku-4-5', reason: 'cheaper for this step' } },
        toolUse('b', 'Bash', {}, 3),
      ], 1),
    ]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's', session: { provider: 'claude-code', model: 'claude-opus-4-1' } })
    expect(items.find((i) => i.id === 'a')).toMatchObject({ provider: 'claude-code', model: 'claude-opus-4-1' })
    expect(items.find((i) => i.id === 'mc')).toMatchObject({ kind: 'marker', label: 'Model → haiku-4-5', output: 'cheaper for this step' })
    expect(items.find((i) => i.id === 'b')?.model).toBe('claude-haiku-4-5')
  })

  it('carries the session context on its lane', () => {
    const tl = buildTimeline({ messages: [], sessionId: 's', session: { provider: 'native', model: 'deepseek-chat', routedBy: 'auto' } })
    expect(tl.lanes.find((l) => l.id === 's')?.context).toMatchObject({ provider: 'native', routedBy: 'auto' })
  })
})

describe('routing decisions', () => {
  it('adds a routing item under the request it served, with score and alternatives', () => {
    const msgs = [user('m1', 'first', 0), assistant('m2', [], 1, { duration_ms: 1 }), user('m3', 'second', 20)]
    const tl = buildTimeline({ messages: msgs, sessionId: 's', decisions: [decision({ at: iso(20) }), decision({ id: 'other', session_id: 'x' })] })
    const routing = tl.items.filter((i) => i.kind === 'routing')
    expect(routing).toHaveLength(1)
    expect(routing[0]).toMatchObject({ parentId: 'request:m3', provider: 'claude-code', status: 'done' })
    expect(routing[0].routing?.alternatives).toHaveLength(2)
    expect(tl.items.find((i) => i.id === 'request:m3')?.routing?.id).toBe('d1')
    expect(tl.items.find((i) => i.id === 'request:m3')?.model).toBe('claude-opus-4-1-20250805')
  })

  it('records a shadow decision without letting it change where the request ran', () => {
    const tl = buildTimeline({
      messages: [user('m1', 'go', 0)], sessionId: 's', session: { provider: 'native', model: 'deepseek-chat' },
      decisions: [decision({ applied: false })],
    })
    const routing = tl.items.find((i) => i.kind === 'routing')
    expect(routing).toMatchObject({ status: 'cancelled' })
    expect(routing?.label).toContain('not applied')
    expect(tl.items.find((i) => i.kind === 'request')).toMatchObject({ provider: 'native', model: 'deepseek-chat' })
  })
})

describe('plan / task / step', () => {
  const work = {
    plans: [{ id: 'p', title: 'Plan', status: 'in_progress' }],
    tasks: [{ id: 't', title: 'Task', status: 'in_progress', planId: 'p', steps: [
      { id: 's2', description: 'second', status: 'pending', order: 2 },
      { id: 's1', description: 'first', status: 'completed', order: 1 },
    ] }],
  }

  it('builds a work lane, steps in order, with statuses', () => {
    const tl = buildTimeline({ messages: [], sessionId: 's', work })
    const lane = tl.lanes[0]
    expect(lane.id).toBe('work:s')
    expect(lane.items.map((i) => [i.kind, i.id, i.status])).toEqual([
      ['plan', 'p', 'running'], ['task', 't', 'running'], ['step', 's1', 'done'], ['step', 's2', 'pending'],
    ])
  })

  it('hangs the requests under the task in progress, so the chain climbs to the plan', () => {
    const msgs = [user('m1', 'go', 0), assistant('m2', [toolUse('a', 'Bash', {}, 1)], 1)]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's', work })
    const { upstream } = chainOf(items, 'a')
    expect(upstream.map((i) => i.id)).toEqual(['p', 't', 'request:m1'])
  })
})

describe('the span of a turn', () => {
  it('ends with the result of the turn, or at its last event', () => {
    const msgs = [
      user('m1', 'go', 0), assistant('m2', [toolUse('a', 'Bash', {}, 1), toolResult('a', 4)], 1, { duration_ms: 3000 }),
      user('m3', 'again', 10), assistant('m4', [toolUse('b', 'Bash', {}, 11), toolResult('b', 17)], 11),
    ]
    const { items } = buildTimeline({ messages: msgs, sessionId: 's' })
    expect(items.find((i) => i.id === 'request:m1')).toMatchObject({ endedAt: at(4).getTime(), durationMs: 4000 })
    // No result (an interrupted turn, an older page): it still ends at its last event.
    expect(items.find((i) => i.id === 'request:m3')).toMatchObject({ endedAt: at(17).getTime() })
  })

  it('is running while its turn streams', () => {
    const streaming = buildTimeline({ messages: [user('m1', 'go', 0), assistant('m2', [toolUse('a', 'Bash', {}, 1)], 1)], sessionId: 's', isStreaming: true })
    expect(streaming.items.find((i) => i.id === 'request:m1')?.status).toBe('running')
    const justSent = buildTimeline({ messages: [user('m1', 'go', 0)], sessionId: 's', isStreaming: true })
    expect(justSent.items.find((i) => i.id === 'request:m1')?.status).toBe('running')
  })

  it('marks the moment the conversation moved to another provider', () => {
    const relayed: ContentBlock = { id: 'rel', type: 'conversation_relayed', content: 'Moved to native', metadata: { to_session_id: 'next', to_provider: 'native', created_at: iso(5) } }
    const { items } = buildTimeline({ messages: [user('m1', 'go', 0), assistant('m2', [relayed], 5)], sessionId: 's' })
    expect(items.find((i) => i.kind === 'marker')).toMatchObject({ kind: 'marker', sessionId: 'next', label: 'Moved to native' })
  })

  it('keys an error or a marker by its server time, so the same event read twice keeps its row', () => {
    const read = (blockId: string) => buildTimeline({
      messages: [user('m1', 'go', 0), assistant('m2', [
        { id: blockId + 'a', type: 'error', content: 'boom', metadata: { created_at: iso(3) } },
        { id: blockId + 'b', type: 'error', content: 'boom again', metadata: { created_at: iso(3) } },
        { id: blockId + 'c', type: 'compact_boundary', content: '', metadata: {} },
      ], 3)],
      sessionId: 's',
    }).items.filter((i) => i.kind !== 'request').map((i) => i.id)
    const transcript = read('x-')
    const history = read('y-')
    // Two errors in the same instant still get two keys; without a time the block id is all there is.
    expect(transcript.slice(0, 2)).toEqual(history.slice(0, 2))
    expect(new Set(transcript).size).toBe(3)
    expect(transcript[2]).toBe('x-c')
  })
})
