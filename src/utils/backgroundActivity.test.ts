import { describe, it, expect } from 'vitest'
import type { BackgroundOutputEntry, ContentBlock } from '@/types'
import {
  STALE_AFTER_MS,
  agentProgress,
  buildActivity,
  buildActivityFromBlock,
  buildActivityFromToolCall,
  classifyActivity,
  deriveStatus,
  extractParams,
  extractUsage,
  extractWorkflowAgents,
  flattenFields,
  humanizeKey,
  normalizeState,
  parseContent,
  subtypeLabel,
  summarizeFields,
  summarizeStatuses,
  tailLines,
} from './backgroundActivity'

const NOW = Date.parse('2026-05-01T10:10:00Z')
const at = (s: number) => `2026-05-01T10:00:${String(s).padStart(2, '0')}Z`
const entry = (content: string, s = 0, extra: Partial<BackgroundOutputEntry> = {}): BackgroundOutputEntry => ({
  source: 'BashOutput',
  content,
  received_at: at(s),
  ...extra,
})

describe('normalizeState', () => {
  it('maps free-form states onto the activity vocabulary', () => {
    expect(normalizeState('start')).toBe('running')
    expect(normalizeState('In_Progress')).toBe('running')
    expect(normalizeState('pending')).toBe('queued')
    expect(normalizeState('completed')).toBe('done')
    expect(normalizeState('error')).toBe('failed')
    expect(normalizeState('canceled')).toBe('cancelled')
    expect(normalizeState('weird')).toBeUndefined()
    expect(normalizeState(42)).toBeUndefined()
  })
})

describe('small formatters', () => {
  it('humanizes keys, ids and lifecycle subtypes', () => {
    expect(humanizeKey('last_tool_name')).toBe('Last tool name')
    expect(humanizeKey('taskId')).toBe('Task id')
    expect(subtypeLabel('task_progress')).toBe('Progress')
    expect(subtypeLabel('task_notification')).toBe('Finished')
    expect(subtypeLabel('some_thing')).toBe('Some thing')
  })
})

describe('parseContent', () => {
  it('parses a JSON object into fields', () => {
    expect(parseContent('{"status":"completed","n":1}')).toEqual({ fields: { status: 'completed', n: 1 }, text: '' })
  })
  it('parses task-notification tags into snake_case fields', () => {
    const r = parseContent('<task-notification><task-id>abc</task-id><status>completed</status><output-file>/tmp/o</output-file></task-notification>')
    expect(r.fields).toEqual({ task_id: 'abc', status: 'completed', output_file: '/tmp/o' })
  })
  it('keeps plain text, broken JSON and JSON arrays as text', () => {
    expect(parseContent('hello\nworld')).toEqual({ text: 'hello\nworld' })
    expect(parseContent('{not json}').fields).toBeUndefined()
    expect(parseContent('{"a":').fields).toBeUndefined()
    expect(parseContent('<b>x</b>').fields).toEqual({ b: 'x' })
    expect(parseContent('<unclosed').fields).toBeUndefined()
  })
})

describe('flattenFields / summarizeFields', () => {
  it('flattens scalars, scalar arrays, one nested level and counts object arrays', () => {
    const rows = flattenFields({
      status: 'running',
      output_file: '/tmp/x',
      tags: ['a', 'b'],
      agents: [{ a: 1 }, { a: 2 }],
      one: [{ a: 1 }],
      empty: [],
      nothing: null,
      flag: true,
      workflow_progress: [{ index: 1 }],
      nested: { deep: { deeper: 1 }, count: 3 },
      blank: '  ',
    })
    expect(rows).toEqual([
      { label: 'Status', value: 'running', mono: false },
      { label: 'Output file', value: '/tmp/x', mono: true },
      { label: 'Tags', value: 'a, b' },
      { label: 'Agents', value: '2 items' },
      { label: 'One', value: '1 item' },
      { label: 'Flag', value: 'true', mono: false },
      { label: 'Nested · count', value: '3', mono: false },
    ])
  })
  it('summarizes into a short human line', () => {
    expect(summarizeFields({ status: 'completed', summary: 'ok', a: 1, b: 2 }, 2)).toBe('status completed · summary ok')
  })
})

describe('workflow agents', () => {
  it('normalizes workflow_progress items with fallbacks', () => {
    const agents = extractWorkflowAgents({
      workflow_progress: [
        { index: 1, state: 'start' },
        { index: 2, name: 'Reviewer', state: 'done', last_tool_name: 'Grep' },
        { label: 'Fixer', status: 'failed' },
        'junk',
      ],
    })
    expect(agents.map((a) => [a.name, a.state, a.detail])).toEqual([
      ['Agent 2', 'running', undefined],
      ['Reviewer', 'done', 'Grep'],
      ['Fixer', 'failed', undefined],
      ['Agent 4', 'running', undefined],
    ])
    expect(extractWorkflowAgents({})).toEqual([])
  })

  it('computes progress', () => {
    const agents = extractWorkflowAgents({
      workflow_progress: [{ state: 'done' }, { state: 'failed' }, { state: 'running' }, { state: 'queued' }],
    })
    expect(agentProgress(agents)).toEqual({ settled: 2, total: 4, pct: 50 })
    expect(agentProgress([])).toEqual({ settled: 0, total: 0, pct: 0 })
  })

  it('extracts usage', () => {
    expect(extractUsage({ usage: { total_tokens: 7681, tool_uses: 3, duration_ms: 1200 } })).toEqual({
      tokens: 7681,
      toolUses: 3,
      durationMs: 1200,
    })
    expect(extractUsage({ usage: {} })).toBeUndefined()
    expect(extractUsage({})).toBeUndefined()
  })
})

describe('classifyActivity', () => {
  it('detects each kind', () => {
    expect(classifyActivity({ source: 'Workflow', fields: {} })).toBe('workflow')
    expect(classifyActivity({ fields: { workflow_progress: [] } })).toBe('workflow')
    expect(classifyActivity({ fields: { workflow_name: 'wf' } })).toBe('workflow')
    expect(classifyActivity({ source: 'Monitor', fields: {} })).toBe('monitor')
    expect(classifyActivity({ source: 'BashOutput', fields: {} })).toBe('shell')
    expect(classifyActivity({ toolName: 'Bash', fields: {} })).toBe('shell')
    expect(classifyActivity({ fields: { command: 'ls' } })).toBe('shell')
    expect(classifyActivity({ source: 'Task', fields: {} })).toBe('agent')
    expect(classifyActivity({ subagentType: 'researcher', fields: {} })).toBe('agent')
    expect(classifyActivity({ source: 'system', fields: {} })).toBe('generic')
  })
})

describe('deriveStatus', () => {
  const base = { kind: 'generic' as const, fields: {}, agents: [] }
  it('prefers an explicit status', () => {
    expect(deriveStatus({ ...base, fields: { status: 'failed' }, toolState: 'done' })).toBe('failed')
  })
  it('treats a task_notification as finished', () => {
    expect(deriveStatus({ ...base, lastSubtype: 'task_notification' })).toBe('done')
  })
  it('aggregates workflow agents', () => {
    const agent = (state: string) => extractWorkflowAgents({ workflow_progress: [{ state }] })[0]
    expect(deriveStatus({ ...base, agents: [agent('running'), agent('done')] })).toBe('running')
    expect(deriveStatus({ ...base, agents: [agent('queued'), agent('queued')] })).toBe('queued')
    expect(deriveStatus({ ...base, agents: [agent('done'), agent('queued')] })).toBe('running')
    expect(deriveStatus({ ...base, agents: [agent('done'), agent('failed')] })).toBe('failed')
    expect(deriveStatus({ ...base, agents: [agent('cancelled'), agent('cancelled')] })).toBe('cancelled')
    expect(deriveStatus({ ...base, agents: [agent('done'), agent('done')] })).toBe('done')
  })
  it('uses the tool result for failure / cancellation', () => {
    expect(deriveStatus({ ...base, toolState: 'failed' })).toBe('failed')
    expect(deriveStatus({ ...base, toolState: 'cancelled' })).toBe('cancelled')
  })
  it('uses the live task registry for non-workflow kinds', () => {
    const activeIds = new Set(['t1'])
    expect(deriveStatus({ ...base, id: 't1', activeIds })).toBe('running')
    expect(deriveStatus({ ...base, id: 't2', activeIds })).toBe('ended')
    // workflows are not in the registry: fall through to recency
    expect(deriveStatus({ ...base, kind: 'workflow', id: 't2', activeIds, lastAt: at(0), now: NOW })).toBe('ended')
  })
  it('falls back to the tool state, then to recency', () => {
    expect(deriveStatus({ ...base, toolState: 'running' })).toBe('running')
    expect(deriveStatus({ ...base, lastAt: at(0), now: Date.parse(at(0)) + 1000 })).toBe('running')
    expect(deriveStatus({ ...base, lastAt: at(0), now: Date.parse(at(0)) + STALE_AFTER_MS + 1 })).toBe('ended')
    expect(deriveStatus({ ...base, lastAt: 'garbage' })).toBe('running')
    expect(deriveStatus({ ...base })).toBe('running')
  })
})

describe('extractParams', () => {
  it('builds readable, de-duplicated parameters', () => {
    const params = extractParams({
      kind: 'agent',
      title: 'Audit auth',
      subagentType: 'researcher',
      description: 'Audit auth',
      fields: { last_tool_name: 'Grep', task_id: 'toolu_01ABCDEFGHIJKLMN', exit_code: 0, output_file: '/tmp/o' },
      toolInput: { model: 'opus', run_in_background: true, prompt: 'long prompt', timeout: 5000, huge: 'x'.repeat(300) },
    })
    expect(params.map((p) => [p.label, p.value])).toEqual([
      ['Agent', 'researcher'],
      ['Tool', 'Grep'],
      ['Model', 'opus'],
      ['Exit code', '0'],
      ['Task id', 'toolu_01ABCDEFGHIJKLMN'],
      ['Output file', '/tmp/o'],
      ['Run in background', 'true'],
      ['Timeout', '5000'],
    ])
  })
  it('shows the workflow name and task only when they differ from the title', () => {
    const params = extractParams({
      kind: 'workflow',
      title: 'Fix flaky tests',
      description: 'Run 3 agents',
      fields: { workflow_name: 'wf-1' },
    })
    expect(params).toEqual([
      { label: 'Workflow', value: 'wf-1', mono: false },
      { label: 'Task', value: 'Run 3 agents', mono: false },
    ])
  })
})

describe('buildActivity', () => {
  it('builds a workflow model from the merged payload', () => {
    const a = buildActivity({
      id: 'wf1',
      source: 'Workflow',
      data: {
        task_id: 'wbk63ch2d',
        workflow_name: 'Fix flaky tests',
        workflow_progress: [{ index: 1, state: 'done', name: 'A' }, { index: 2, state: 'running', name: 'B' }],
        usage: { total_tokens: 1500, tool_uses: 4 },
      },
      entries: [
        entry('task_started', 0, { source: 'Workflow', subtype: 'task_started' }),
        entry('task_progress · B', 30, { source: 'Workflow', subtype: 'task_progress' }),
      ],
      count: 5,
      now: NOW,
    })
    expect(a.kind).toBe('workflow')
    expect(a.status).toBe('running')
    expect(a.title).toBe('Fix flaky tests')
    expect(a.agents).toHaveLength(2)
    expect(a.usage?.tokens).toBe(1500)
    expect(a.events.map((e) => e.label)).toEqual(['Started', 'Progress'])
    expect(a.durationMs).toBe(30_000)
    expect(a.hiddenCount).toBe(3)
    expect(a.raw).toBeDefined()
  })

  it('builds a shell model with command and output lines (JSON never leaks)', () => {
    const a = buildActivity({
      id: 'b1',
      source: 'BashOutput',
      entries: [entry('compiling\nlinking\n', 0), entry('{"status":"completed","exit_code":0}', 5)],
      tool: { name: 'Bash', input: { command: 'npm run build\n&& echo ok', timeout: 9000 }, state: 'done' },
      now: NOW,
    })
    expect(a.kind).toBe('shell')
    expect(a.title).toBe('npm run build')
    expect(a.command).toContain('echo ok')
    expect(a.outputLines).toEqual(['compiling', 'linking'])
    expect(a.status).toBe('done')
    expect(a.events[1].detail).toBe('status completed · exit code 0')
    expect(a.params.find((p) => p.label === 'Exit code')?.value).toBe('0')
  })

  it('builds sub-agent and generic models', () => {
    const agent = buildActivity({ id: 'a', source: 'Task', subagentType: 'researcher', description: 'Look around', entries: [entry('found it', 0)], now: NOW })
    expect(agent.kind).toBe('agent')
    expect(agent.title).toBe('Look around')
    const bare = buildActivity({ id: 'a', source: 'Task', subagentType: 'researcher', entries: [], now: NOW })
    expect(bare.title).toBe('researcher')
    expect(buildActivity({ id: 'a', source: 'Task', entries: [], now: NOW }).title).toBe('Sub-agent')

    const generic = buildActivity({ id: 'g', source: 'system', entries: [entry('{"summary":"all good","n":2}', 0)], now: NOW })
    expect(generic.kind).toBe('generic')
    expect(generic.title).toBe('all good')
    expect(generic.details.map((d) => d.label)).toEqual(['N'])
    expect(buildActivity({ id: 'g', source: 'system', entries: [], now: NOW }).title).toBe('system')
  })

  it('builds monitor and titleless shell models', () => {
    expect(buildActivity({ id: 'm', source: 'Monitor', description: 'watch logs', entries: [], now: NOW }).title).toBe('watch logs')
    expect(buildActivity({ id: 'm', source: 'Monitor', entries: [], tool: { name: 'Monitor', input: { command: 'tail -f x' }, state: 'running' }, now: NOW }).title).toBe('tail -f x')
    expect(buildActivity({ id: 'm', source: 'Monitor', entries: [], now: NOW }).title).toBe('Monitor')
    expect(buildActivity({ id: 's', source: 'Bash', entries: [], now: NOW }).title).toBe('Background command')
    expect(buildActivity({ id: 's', source: 'Bash', description: 'Run tests', entries: [], now: NOW }).title).toBe('Run tests')
    expect(buildActivity({ id: 'w', source: 'Workflow', entries: [], now: NOW }).title).toBe('Workflow')
  })
})

describe('block / tool-call adapters', () => {
  it('builds from a background_activity block', () => {
    const block: ContentBlock = {
      id: 'b',
      type: 'background_activity',
      content: 'last',
      metadata: {
        correlation_id: 'c1',
        source: 'Workflow',
        count: 2,
        first_received_at: at(0),
        last_received_at: at(10),
        data: { workflow_name: 'wf', status: 'completed' },
        entries: [entry('x', 0), entry('y', 10)],
      },
    }
    const a = buildActivityFromBlock(block, { now: NOW })
    expect(a.id).toBe('c1')
    expect(a.status).toBe('done')
    expect(a.durationMs).toBe(10_000)
  })

  it('falls back to the block content when there are no entries or metadata', () => {
    const a = buildActivityFromBlock({ id: 'b', type: 'background_activity', content: 'lonely' }, { now: NOW })
    expect(a.id).toBe('b')
    expect(a.events).toHaveLength(1)
    expect(a.events[0].detail).toBe('lonely')
    expect(buildActivityFromBlock({ id: 'b', type: 'background_activity', content: '' }, { now: NOW }).events).toEqual([])
  })

  it('builds from a tool_use with child outputs and maps the tool result', () => {
    const toolUse: ContentBlock = {
      id: 'tu',
      type: 'tool_use',
      content: 'Task',
      metadata: {
        tool_call_id: 'toolu_1',
        tool_name: 'Task',
        tool_input: { subagent_type: 'researcher', description: 'Dig' },
        child_outputs: [entry('progress', 0, { source: 'Task' })],
      },
    }
    const running = buildActivityFromToolCall(toolUse, undefined, { now: Date.parse(at(1)) })
    expect(running.kind).toBe('agent')
    expect(running.status).toBe('running')
    const failed = buildActivityFromToolCall(toolUse, { id: 'r', type: 'tool_result', content: '', metadata: { is_error: true } })
    expect(failed.status).toBe('failed')
    const cancelled = buildActivityFromToolCall(toolUse, { id: 'r', type: 'tool_result', content: '', metadata: { is_cancelled: true } })
    expect(cancelled.status).toBe('cancelled')
    const done = buildActivityFromToolCall(
      { id: 'tu', type: 'tool_use', content: 'Workflow', metadata: { child_data: { workflow_name: 'wf', status: 'completed' } } },
      { id: 'r', type: 'tool_result', content: '' },
      { now: NOW },
    )
    expect(done.status).toBe('done')
    expect(done.id).toBe('tu')
  })
})

describe('aggregates', () => {
  it('counts statuses', () => {
    const counts = summarizeStatuses(
      (['running', 'running', 'queued', 'done', 'failed', 'ended', 'cancelled'] as const).map((status) => ({ status })),
    )
    expect(counts).toEqual({ running: 2, queued: 1, done: 1, failed: 1, other: 2, total: 7 })
  })
  it('tails long streams', () => {
    expect(tailLines(['a', 'b'], 5)).toEqual({ shown: ['a', 'b'], omitted: 0 })
    expect(tailLines(['a', 'b', 'c'], 2)).toEqual({ shown: ['b', 'c'], omitted: 1 })
  })
})
