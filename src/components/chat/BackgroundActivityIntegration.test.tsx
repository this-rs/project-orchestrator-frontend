/**
 * Integration: background activity reaches the transcript through
 * ChatMessageBubble (grouped orphan blocks) and ToolCallBlock (child outputs
 * of a Workflow / Bash tool_use) as readable UI, never raw JSON.
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ChatMessage, ContentBlock } from '@/types'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ToolCallBlock } from './ToolCallBlock'

const orphan = (id: string, corr: string, content: string): ContentBlock => ({
  id,
  type: 'background_activity',
  content,
  metadata: {
    correlation_id: corr,
    source: 'BashOutput',
    count: 1,
    first_received_at: '2026-05-01T10:00:00Z',
    last_received_at: '2026-05-01T10:00:01Z',
    entries: [{ source: 'BashOutput', content, received_at: '2026-05-01T10:00:01Z' }],
    data: { status: 'completed' },
  },
})

describe('ChatMessageBubble', () => {
  it('renders consecutive background blocks as one chained panel', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      timestamp: new Date(),
      blocks: [
        { id: 't', type: 'text', content: 'Working on it' },
        orphan('b1', 'c1', 'first'),
        orphan('b2', 'c2', 'second'),
      ],
    }
    render(<ChatMessageBubble message={message} isStreaming={false} />)
    expect(screen.getAllByTestId('background-activity-block')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Background activity/ })).toHaveTextContent('2 done')
  })
})

describe('ToolCallBlock child outputs', () => {
  it('renders a Workflow tool call with per-agent progress instead of raw ticks', () => {
    const toolUse: ContentBlock = {
      id: 'tu',
      type: 'tool_use',
      content: 'Workflow',
      metadata: {
        tool_call_id: 'toolu_WF',
        tool_name: 'Workflow',
        tool_input: {},
        child_outputs: [
          { source: 'Workflow', content: 'task_progress', received_at: '2026-05-01T10:00:05Z', subtype: 'task_progress' },
        ],
        child_data: {
          workflow_name: 'Fix tests',
          workflow_progress: [
            { index: 1, name: 'A', state: 'done' },
            { index: 2, name: 'B', state: 'running' },
          ],
        },
      },
    }
    render(<ToolCallBlock block={toolUse} />)
    const card = screen.getByTestId('background-activity-card')
    expect(card).toHaveAttribute('data-kind', 'workflow')
    expect(card).toHaveAttribute('data-status', 'running')
    expect(screen.getByText('1/2 agents')).toBeInTheDocument()
    // Folded while it runs: the line above is the whole card until it is opened.
    expect(within(card).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders no activity card for a plain tool call', () => {
    render(
      <ToolCallBlock
        block={{ id: 'tu', type: 'tool_use', content: 'Read', metadata: { tool_call_id: 'x', tool_name: 'Read', tool_input: {} } }}
      />,
    )
    expect(screen.queryByTestId('background-activity-card')).not.toBeInTheDocument()
  })
})
