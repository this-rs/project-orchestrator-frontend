import { describe, it, expect } from 'vitest'
import { touchedBy } from './agentTouch'

const call = (over: Record<string, unknown>) => ({ type: 'tool_use_input_resolved', id: 'toolu_1', ...over })

describe('touchedBy — file tools', () => {
  it('a Read of a file touches that file, as a read', () => {
    expect(touchedBy(call({ tool: 'Read', category: 'read', input: { file_path: '/p/src/a.ts' } }))).toEqual({
      kind: 'read',
      refs: ['/p/src/a.ts'],
    })
  })

  it('an Edit touches its file, as an edit', () => {
    expect(touchedBy(call({ tool: 'Edit', category: 'edit', input: { file_path: '/p/src/a.ts' } }))?.kind).toBe('edit')
  })

  it('falls back on the tool name when the backend gives no category', () => {
    expect(touchedBy(call({ tool: 'MultiEdit', input: { file_path: '/p/a.ts' } }))?.kind).toBe('edit')
    expect(touchedBy(call({ tool: 'Grep', input: { path: '/p/src' } }))).toEqual({ kind: 'search', refs: ['/p/src'] })
  })

  it('reads the first of `paths` when no single path is given', () => {
    expect(touchedBy(call({ tool: 'Read', input: { paths: ['/p/x.ts', '/p/y.ts'] } }))?.refs).toEqual(['/p/x.ts'])
  })

  it('a call with no readable target touches nothing', () => {
    expect(touchedBy(call({ tool: 'Bash', category: 'command', input: { command: 'ls' } }))).toBeNull()
  })

  it('a sub-agent call touches nothing', () => {
    expect(touchedBy(call({ tool: 'Task', category: 'agent', input: { file_path: '/p/a.ts' } }))).toBeNull()
    expect(touchedBy(call({ tool: 'Agent', input: { description: 'x', path: '/p/a.ts' } }))).toBeNull()
  })
})

describe('touchedBy — project-orchestrator tools', () => {
  const po = (tool: string, input: Record<string, unknown>) =>
    call({ tool: `mcp__project-orchestrator__${tool}`, category: 'mcp', input })

  it('a graph read designates the entities of its input', () => {
    expect(touchedBy(po('task', { action: 'get_context', plan_id: 'P1', task_id: 'T1' }))).toEqual({
      kind: 'query',
      refs: ['T1', 'P1'],
    })
  })

  it('a code query is a read whatever its action', () => {
    expect(touchedBy(po('code', { action: 'analyze_impact', file_path: '/p/a.rs' }))?.refs).toEqual(['/p/a.rs'])
  })

  it('a write is not a touch: it creates its own node, announced by the graph channel', () => {
    expect(touchedBy(po('note', { action: 'create', note_id: 'N1', content: 'x' }))).toBeNull()
    expect(touchedBy(po('task', { action: 'update', task_id: 'T1', status: 'completed' }))).toBeNull()
  })

  it('a read with no entity in its input touches nothing', () => {
    expect(touchedBy(po('project', { action: 'list' }))).toBeNull()
  })
})

describe('touchedBy — what is not a tool call', () => {
  it('ignores text, results and malformed input', () => {
    expect(touchedBy({ type: 'assistant_text', text: 'hello' })).toBeNull()
    expect(touchedBy({ type: 'tool_result', id: 'toolu_1' })).toBeNull()
    expect(touchedBy(null)).toBeNull()
    expect(touchedBy('nope')).toBeNull()
  })

  it('the start of a call, before its input is known, touches nothing yet', () => {
    expect(touchedBy({ type: 'tool_use', tool: 'Read', category: 'read', input: {} })).toBeNull()
  })
})
