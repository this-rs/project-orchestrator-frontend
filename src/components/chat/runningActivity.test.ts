/**
 * The rules that decide what the activity bar lists. Each test names one.
 *
 * Run with: npx vitest run src/components/chat/runningActivity.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { BackgroundTaskInfo, ChatMessage, ContentBlock } from '@/types'
import { collectRunning, countByKind } from './runningActivity'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString()

let seq = 0
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): ContentBlock => ({
  id: `b${++seq}`,
  type: 'tool_use',
  content: name,
  metadata: { tool_call_id: id, tool_name: name, tool_input: input, created_at: at(60), ...extra },
})
const toolResult = (id: string, extra: Record<string, unknown> = {}): ContentBlock => ({
  id: `b${++seq}`,
  type: 'tool_result',
  content: 'ok',
  metadata: { tool_call_id: id, ...extra },
})
const assistant = (...blocks: ContentBlock[]): ChatMessage => ({
  id: `m${++seq}`,
  role: 'assistant',
  blocks,
  timestamp: new Date(NOW),
})
const user = (): ChatMessage => ({ id: `m${++seq}`, role: 'user', blocks: [], timestamp: new Date(NOW) })

const task = (id: string, kind: BackgroundTaskInfo['kind'], description: string): BackgroundTaskInfo => ({
  id,
  kind,
  description,
  started_at: at(30),
  last_seen_at: at(1),
  pid: null,
  parent_tool_use_id: id,
})

const workflowTick = (progress: Array<Record<string, unknown>>, secondsAgo = 5, extra: Record<string, unknown> = {}) => ({
  child_outputs: [{ source: 'workflow', content: '', received_at: at(secondsAgo), subtype: 'task_progress' }],
  child_data: { workflow_name: 'review-changes', workflow_progress: progress, ...extra },
})

const collect = (messages: ChatMessage[], backgroundTasks: BackgroundTaskInfo[] = [], isStreaming = false) =>
  collectRunning({ messages, backgroundTasks, isStreaming, now: NOW })

describe('collectRunning — what the activity bar lists', () => {
  it('lists nothing when nothing runs', () => {
    expect(collect([])).toEqual([])
    expect(collect([user(), assistant(toolUse('t1', 'Read'), toolResult('t1'))], [], true)).toEqual([])
  })

  it('lists every registered background task, stoppable, with its kind', () => {
    const items = collect([], [task('m1', 'monitor', 'tail -f ci.log'), task('s1', 'bash_background', 'npm run dev')])
    expect(items).toEqual([
      { id: 's1', kind: 'shell', title: 'npm run dev', startedAt: at(30), anchorId: 's1', taskId: 's1' },
      { id: 'm1', kind: 'monitor', title: 'tail -f ci.log', startedAt: at(30), anchorId: 'm1', taskId: 'm1' },
    ])
  })

  it('names a background task that has no description after its kind', () => {
    const items = collect([], [task('m1', 'monitor', ''), task('s1', 'bash_background', '  ')])
    expect(items.map((i) => i.title)).toEqual(['Bash', 'Monitor'])
  })

  it('does not list a registered task a second time from its transcript block', () => {
    const block = toolUse('s1', 'Bash', { command: 'npm run dev', run_in_background: true }, {
      child_outputs: [{ source: 'Bash', content: 'ready', received_at: at(2) }],
    })
    const items = collect([assistant(block, toolResult('s1'))], [task('s1', 'bash_background', 'npm run dev')])
    expect(items).toHaveLength(1)
    expect(items[0].taskId).toBe('s1')
  })

  it('never guesses a Bash or a Monitor from the transcript: the registry alone lists them', () => {
    // Fresh tick, no registry entry: recency would say "running". It is not listed.
    const block = toolUse('s9', 'Bash', { command: 'sleep 1', run_in_background: true }, {
      child_outputs: [{ source: 'Bash', content: 'done', received_at: at(1) }],
    })
    expect(collect([assistant(block, toolResult('s9'))])).toEqual([])
  })

  it('lists a running workflow with its fan-out progress', () => {
    const block = toolUse('w1', 'Workflow', {}, workflowTick([
      { name: 'a', state: 'completed' },
      { name: 'b', state: 'running' },
      { name: 'c', state: 'pending' },
    ]))
    const items = collect([assistant(block, toolResult('w1'))])
    expect(items).toEqual([
      { id: 'w1', kind: 'workflow', title: 'review-changes', startedAt: at(5), progress: { settled: 1, total: 3 }, anchorId: 'w1' },
    ])
  })

  it('drops a workflow once every agent has settled, or once it reports a terminal status', () => {
    const settled = toolUse('w1', 'Workflow', {}, workflowTick([{ state: 'completed' }, { state: 'failed' }]))
    const reported = toolUse('w2', 'Workflow', {}, workflowTick([{ state: 'running' }], 5, { status: 'completed' }))
    expect(collect([assistant(settled, toolResult('w1'), reported, toolResult('w2'))])).toEqual([])
  })

  it('lists a foreground sub-agent of the streaming turn, titled by its description', () => {
    const block = toolUse('a1', 'Task', { description: 'Map the backend\nsecond line', subagent_type: 'Explore' })
    const items = collect([user(), assistant(block)], [], true)
    expect(items).toEqual([{ id: 'a1', kind: 'agent', title: 'Map the backend', startedAt: at(60), anchorId: 'a1' }])
  })

  it('falls back to the sub-agent type, then to a generic name, and truncates long titles', () => {
    const typed = toolUse('a1', 'Agent', { subagent_type: 'Plan' })
    const bare = toolUse('a2', 'Task')
    const long = toolUse('a3', 'Task', { description: 'x'.repeat(200) })
    const titles = collect([assistant(typed, bare, long)], [], true).map((i) => i.title)
    expect(titles[0]).toBe('Plan')
    expect(titles[1]).toBe('Sub-agent')
    expect(titles[2]).toHaveLength(80)
    expect(titles[2].endsWith('…')).toBe(true)
  })

  it('does not list a sub-agent that returned, nor one of a turn that is no longer streaming', () => {
    const returned = [assistant(toolUse('a1', 'Task', { description: 'done' }), toolResult('a1'))]
    expect(collect(returned, [], true)).toEqual([])
    const interrupted = [assistant(toolUse('a2', 'Task', { description: 'cut' }))]
    expect(collect(interrupted, [], false)).toEqual([])
  })

  it('does not revive an unanswered sub-agent of an OLDER message when a new turn streams', () => {
    const old = assistant(toolUse('a1', 'Task', { description: 'stale' }))
    const items = collect([old, user(), assistant(toolUse('t1', 'Read'))], [], true)
    expect(items).toEqual([])
  })

  it('a foreground sub-agent that returned is over even if its last tick is fresh', () => {
    const block = toolUse('a1', 'Task', { description: 'fg' }, {
      child_outputs: [{ source: 'Task', content: 'working', received_at: at(1) }],
    })
    expect(collect([assistant(block, toolResult('a1'))], [], true)).toEqual([])
  })

  it('a background sub-agent stays listed after its receipt, until it notifies', () => {
    const running = toolUse('a1', 'Task', { description: 'bg', run_in_background: true }, {
      child_outputs: [{ source: 'Task', content: 'working', received_at: at(1) }],
    })
    expect(collect([assistant(running, toolResult('a1'))]).map((i) => i.id)).toEqual(['a1'])

    const notified = toolUse('a2', 'Task', { description: 'bg', run_in_background: true }, {
      child_outputs: [{ source: 'Task', content: 'finished', received_at: at(1), subtype: 'task_notification' }],
    })
    expect(collect([assistant(notified, toolResult('a2'))])).toEqual([])
  })

  it('lists an orphan background workflow block, anchored on the block itself', () => {
    const orphan: ContentBlock = {
      id: 'orphan-1',
      type: 'background_activity',
      content: '',
      metadata: {
        correlation_id: 'w7',
        source: 'workflow',
        count: 1,
        first_received_at: at(40),
        last_received_at: at(2),
        data: { workflow_name: 'nightly', workflow_progress: [{ state: 'running' }] },
        entries: [{ source: 'workflow', content: '', received_at: at(2), subtype: 'task_progress' }],
      },
    }
    const items = collect([assistant(orphan)])
    expect(items).toEqual([
      { id: 'w7', kind: 'workflow', title: 'nightly', startedAt: at(40), progress: { settled: 0, total: 1 }, anchorId: 'orphan-1' },
    ])
  })

  it('lists a detached run only while it streams, with what opens and stops it', () => {
    const items = collectRunning({
      messages: [],
      backgroundTasks: [],
      isStreaming: false,
      now: NOW,
      detachedRuns: [
        { sessionId: 'r1', title: 'Plan run\nsecond line', isStreaming: true, startedAt: at(120), planId: 'p1' },
        { sessionId: 'r2', title: 'Delegated task', isStreaming: true, startedAt: at(20) },
        { sessionId: 'r3', title: 'Finished', isStreaming: false, startedAt: at(900), planId: 'p1' },
      ],
    })
    expect(items).toEqual([
      { id: 'r1', kind: 'run', title: 'Plan run', startedAt: at(120), sessionId: 'r1', planId: 'p1' },
      { id: 'r2', kind: 'run', title: 'Delegated task', startedAt: at(20), sessionId: 'r2', planId: undefined },
    ])
  })

  it('puts runs before everything else', () => {
    const items = collectRunning({
      messages: [],
      backgroundTasks: [task('m1', 'monitor', 'mon')],
      isStreaming: false,
      now: NOW,
      detachedRuns: [{ sessionId: 'r1', title: 'Plan run', isStreaming: true, startedAt: at(1) }],
    })
    expect(items.map((i) => i.kind)).toEqual(['run', 'monitor'])
  })

  it('orders workflows, then agents, then shells, then monitors; oldest first inside a kind', () => {
    const wf = toolUse('w1', 'Workflow', {}, workflowTick([{ state: 'running' }]))
    const agentNew = toolUse('a2', 'Task', { description: 'new' }, { created_at: at(10) })
    const agentOld = toolUse('a1', 'Task', { description: 'old' }, { created_at: at(90) })
    const items = collect(
      [assistant(agentNew, agentOld, wf, toolResult('w1'))],
      [task('m1', 'monitor', 'mon'), task('s1', 'bash_background', 'sh')],
      true,
    )
    expect(items.map((i) => i.id)).toEqual(['w1', 'a1', 'a2', 's1', 'm1'])
    expect(countByKind(items)).toEqual([
      { kind: 'workflow', count: 1 },
      { kind: 'agent', count: 2 },
      { kind: 'shell', count: 1 },
      { kind: 'monitor', count: 1 },
    ])
  })
})
