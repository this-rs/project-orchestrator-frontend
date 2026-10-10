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
    expect(items.find((i) => i.id === 'rel')).toMatchObject({ kind: 'marker', sessionId: 'next', label: 'Moved to native' })
  })
})
