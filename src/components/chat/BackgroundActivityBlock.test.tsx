/**
 * Render tests for the background-activity UI: the status-first group panel
 * (`BackgroundActivityGroup` / `BackgroundActivityBlock`) and the per-type
 * activity cards (F10 of plan 5985a7c4 + readable-activity redesign).
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { chatBackgroundTasksAtom } from '@/atoms'
import type { BackgroundActivityMetadata, BackgroundTaskInfo, ContentBlock } from '@/types'
import { BackgroundActivityBlock, BackgroundActivityGroup } from './BackgroundActivityBlock'
import { ExpandableText } from './BackgroundActivityCard'

function block(meta: Partial<BackgroundActivityMetadata>, id = 'b-1'): ContentBlock {
  const entries = meta.entries ?? []
  const full: BackgroundActivityMetadata = {
    correlation_id: 'toolu_X',
    source: 'Monitor',
    count: entries.length,
    first_received_at: entries[0]?.received_at ?? '2026-05-01T10:00:00Z',
    last_received_at: entries[entries.length - 1]?.received_at ?? '2026-05-01T10:00:00Z',
    entries,
    ...meta,
  }
  return {
    id,
    type: 'background_activity',
    content: entries[entries.length - 1]?.content ?? '',
    metadata: full as unknown as Record<string, unknown>,
  }
}

const tick = (i: number, source = 'Monitor', content = `EVENT ${i}`) => ({
  source,
  content,
  received_at: `2026-05-01T10:00:${String(i).padStart(2, '0')}Z`,
})

function withTasks(ids: string[], ui: ReactNode) {
  const store = createStore()
  store.set(
    chatBackgroundTasksAtom,
    ids.map((id) => ({ id, kind: 'bash', description: id, started_at: '', last_seen_at: '' }) as unknown as BackgroundTaskInfo),
  )
  return <Provider store={store}>{ui}</Provider>
}

const workflowBlock = (over: Partial<BackgroundActivityMetadata> = {}) =>
  block({
    correlation_id: 'wf-1',
    source: 'Workflow',
    entries: [
      { ...tick(0, 'Workflow', 'task_started'), subtype: 'task_started' },
      { ...tick(20, 'Workflow', 'task_progress · x'), subtype: 'task_progress' },
    ],
    data: {
      workflow_name: 'Fix flaky tests',
      task_id: 'wbk63ch2d',
      workflow_progress: [
        { index: 1, name: 'Reproducer', state: 'done' },
        { index: 2, name: 'Fixer', state: 'running', last_tool_name: 'Edit' },
        { index: 3, name: 'Verifier', state: 'pending' },
      ],
      usage: { total_tokens: 12345, tool_uses: 7 },
    },
    ...over,
  })

describe('BackgroundActivityGroup — summary', () => {
  it('leads with status counts and lists chained activities', () => {
    const blocks = [
      workflowBlock(),
      block({ correlation_id: 'b1', source: 'BashOutput', entries: [tick(1, 'BashOutput', 'ok')], data: { command: 'npm test', status: 'completed' } }, 'b-2'),
      block({ correlation_id: 'b2', source: 'BashOutput', entries: [tick(2, 'BashOutput', 'boom')], data: { command: 'make', status: 'failed' } }, 'b-3'),
    ]
    render(withTasks(['wf-1'], <BackgroundActivityGroup blocks={blocks} />))
    const toggle = screen.getAllByRole('button')[0]
    expect(toggle).toHaveTextContent('Background activity')
    expect(toggle).toHaveTextContent('1 running')
    expect(toggle).toHaveTextContent('1 failed')
    expect(toggle).toHaveTextContent('1 done')
    // Something is running/failed → open by default, one card per activity.
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const cards = screen.getAllByTestId('background-activity-card')
    expect(cards.map((c) => c.getAttribute('data-kind'))).toEqual(['workflow', 'shell', 'shell'])
    expect(cards.map((c) => c.getAttribute('data-status'))).toEqual(['running', 'done', 'failed'])
  })

  it('starts collapsed when everything is finished, and toggles', () => {
    render(
      <BackgroundActivityBlock
        block={block({ source: 'Task', subagent_type: 'researcher', data: { status: 'completed' }, entries: [tick(1, 'Task', 'done!')] })}
      />,
    )
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('1 done')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('background-activity-card')).toHaveAttribute('data-kind', 'agent')
  })

  it('counts activities that are no longer tracked as ended', () => {
    render(withTasks(['other'], <BackgroundActivityBlock block={block({ entries: [tick(1)] })} />))
    expect(screen.getByRole('button')).toHaveTextContent('1 ended')
  })
})

describe('workflow renderer', () => {
  it('shows per-agent state, progress and usage — never JSON', () => {
    render(withTasks([], <BackgroundActivityBlock block={workflowBlock()} />))
    // single running activity → card open by default
    expect(screen.getByText('Fix flaky tests')).toBeInTheDocument()
    expect(screen.getByText('1/3 agents')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '33')
    const agents = screen.getByRole('list', { name: /agents of/i })
    expect(within(agents).getByText('Reproducer')).toBeInTheDocument()
    expect(within(agents).getByText('Done')).toBeInTheDocument()
    expect(within(agents).getByText('Running')).toBeInTheDocument()
    expect(within(agents).getByText('Queued')).toBeInTheDocument()
    expect(within(agents).getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('12.3k tokens')).toBeInTheDocument()
    expect(screen.getByText('7 tool uses')).toBeInTheDocument()
    expect(screen.getByLabelText('Parameters')).toHaveTextContent('Task idwbk63ch2d')
    expect(document.body.textContent).not.toContain('workflow_progress')
    expect(document.body.textContent).not.toContain('{')
  })

  it('shows the timeline with humanized lifecycle labels', () => {
    render(withTasks([], <BackgroundActivityBlock block={workflowBlock()} />))
    fireEvent.click(screen.getByRole('button', { name: /Timeline · 2 events/ }))
    const list = screen.getByRole('list', { name: /events of/i })
    expect(list).toHaveTextContent('Started')
    expect(list).toHaveTextContent('Progress')
  })
})

describe('shell renderer', () => {
  const shell = () =>
    block({
      correlation_id: 'b1',
      source: 'BashOutput',
      count: 30,
      entries: Array.from({ length: 20 }, (_, i) => tick(i, 'BashOutput', `line ${i}`)),
      data: { command: 'npm run build && npm test', timeout: 9000 },
    })

  it('shows the command as code and a collapsed output tail', () => {
    render(withTasks(['b1'], <BackgroundActivityBlock block={shell()} />))
    expect(screen.getByText('npm run build && npm test', { selector: 'div.font-mono' })).toBeInTheDocument()
    const outputToggle = screen.getByRole('button', { name: /Output · 20 lines/ })
    expect(outputToggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(outputToggle)
    const pre = screen.getByLabelText('Output')
    expect(pre.tagName).toBe('PRE')
    expect(pre.textContent).toContain('line 19')
    expect(pre.textContent).not.toContain('line 0\n')
    fireEvent.click(screen.getByRole('button', { name: /Show 8 earlier lines/ }))
    expect(screen.getByLabelText('Output').textContent).toContain('line 0')
  })

  it('opens short output straight away and offers the raw payload only as a last resort', () => {
    const b = block({
      correlation_id: 'b1',
      source: 'BashOutput',
      entries: [tick(1, 'BashOutput', 'hi'), tick(2, 'BashOutput', '{"exit_code":0}')],
    })
    render(withTasks(['b1'], <BackgroundActivityBlock block={b} />))
    expect(screen.getByLabelText('Output')).toHaveTextContent('hi')
    expect(screen.getByLabelText('Parameters')).toHaveTextContent('Exit code0')
    const raw = screen.getByRole('button', { name: 'Raw payload' })
    expect(raw).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(raw)
    expect(screen.getByLabelText('Raw payload', { selector: 'pre' })).toHaveTextContent('"exit_code": 0')
  })
})

describe('agent + generic renderers', () => {
  it('renders sub-agent params as chips', () => {
    const b = block({ source: 'Task', subagent_type: 'researcher', description: 'Audit auth', entries: [tick(1, 'Task', 'reading files')], data: { last_tool_name: 'Grep' } })
    render(withTasks(['toolu_X'], <BackgroundActivityBlock block={b} />))
    expect(screen.getByText('Audit auth')).toBeInTheDocument()
    const params = screen.getByLabelText('Parameters')
    expect(params).toHaveTextContent('Agentresearcher')
    expect(params).toHaveTextContent('ToolGrep')
    expect(screen.getByLabelText('Latest output')).toHaveTextContent('reading files')
  })

  it('pretty-prints structured generic content as key/value rows', () => {
    const b = block({
      source: 'system',
      entries: [tick(1, 'system', '<task-notification><task-id>abc</task-id><status>weird</status><summary>All good</summary></task-notification>')],
    })
    render(withTasks(['toolu_X'], <BackgroundActivityBlock block={b} />))
    expect(screen.getByText('All good')).toBeInTheDocument()
    const term = screen.getByText('Status')
    expect(term.tagName).toBe('DT')
    expect(screen.getByText('weird')).toBeInTheDocument()
    expect(screen.getByLabelText('Parameters')).toHaveTextContent('Task idabc')
    expect(document.body.textContent).not.toContain('<task-notification>')
  })
})

describe('accessibility + truncation', () => {
  it('expands long text on demand with aria-expanded', () => {
    render(<ExpandableText text={'x'.repeat(400)} />)
    const btn = screen.getByRole('button', { name: 'Show more' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not show a toggle for short text', () => {
    render(<ExpandableText text="short" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('notes earlier events that were not kept', () => {
    render(withTasks(['toolu_X'], <BackgroundActivityBlock block={block({ count: 25, entries: [tick(1), tick(2)] })} />))
    fireEvent.click(screen.getByRole('button', { name: /Timeline · 25 events/ }))
    expect(screen.getByRole('list', { name: /events of/i })).toHaveTextContent('23 earlier events not kept')
  })
})
