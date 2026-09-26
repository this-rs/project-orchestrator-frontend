/**
 * WaveAgentCard — the row must stay inside its column on narrow screens
 * (phone 390px, tablet 820px with the conversation panel open):
 *   1. the text column cannot widen the row (min-w-0 + break-words);
 *   2. the action buttons wrap instead of overflowing (flex-wrap);
 *   3. buttons shrink (min-w-0) and carry a compact, truncating label.
 * Plus: the actions that were visible before the redesign are still reachable.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentProps } from 'react'
import type { ActiveAgentSnapshot } from '@/services/runner'
import type { AgentExecution } from '@/types'

vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'ws',
}))

import { WaveAgentCard } from '../WaveAgentCard'

const baseAgent: ActiveAgentSnapshot = {
  session_id: 'sess-1',
  task_id: 'task-1',
  task_title: 'Test task with a rather long title that must wrap on a phone',
  status: 'running',
  elapsed_secs: 120,
  cost_usd: 0.05,
}

const execution: AgentExecution = {
  id: 'ex-1',
  run_id: 'run-1',
  task_id: 'task-1',
  session_id: 'sess-1',
  started_at: new Date().toISOString(),
  cost_usd: 0.05,
  duration_secs: 120,
  status: 'completed',
  tools_used: JSON.stringify(['Read', 'Edit']),
  files_modified: ['src/a.ts', 'src/very/long/path/that/could/overflow/the/row/on/a/phone.tsx'],
  commits: ['abcdef1234567'],
}

function renderRow(props: Partial<ComponentProps<typeof WaveAgentCard>> = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <WaveAgentCard agent={baseAgent} isSelected={false} onToggleConversation={() => {}} {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('WaveAgentCard — no horizontal overflow', () => {
  it('text column is min-w-0 and the title wraps (break-words) instead of widening the row', () => {
    renderRow()
    const title = screen.getByText(baseAgent.task_title)
    // EntityRow: <li> > [leading] <div.flex-1.min-w-0> <div.flex> <div.title min-w-0 line-clamp-2 break-words>
    const titleBox = title.closest('div') as HTMLElement
    expect(titleBox.className).toContain('min-w-0')
    expect(titleBox.className).toContain('break-words')
    const column = titleBox.parentElement!.parentElement as HTMLElement
    expect(column.className).toContain('flex-1')
    expect(column.className).toContain('min-w-0')
  })

  it('action buttons row wraps on narrow widths', () => {
    renderRow({ onRetryTask: () => {}, agent: { ...baseAgent, status: 'failed' }, execution })
    const footer = screen.getByTestId('agent-actions')
    expect(footer.className).toContain('flex-wrap')
    expect(footer.className).toContain('min-w-0')
    // three visible buttons: conversation, retry, details
    expect(within(footer).getAllByRole('button')).toHaveLength(3)
  })

  it('conversation button has a compact label, shrinks (min-w-0) and truncates', () => {
    renderRow()
    const btn = screen.getByRole('button', { name: /view conversation/i })
    expect(btn.className).toContain('min-w-0')
    expect(btn.textContent).toBe('Conversation')
    const label = within(btn).getByText('Conversation')
    expect(label.className).toContain('truncate')
  })
})

describe('WaveAgentCard — actions and information', () => {
  it('toggles the conversation with the session id and task title', () => {
    const onToggle = vi.fn()
    renderRow({ onToggleConversation: onToggle })
    fireEvent.click(screen.getByRole('button', { name: /view conversation/i }))
    expect(onToggle).toHaveBeenCalledWith('sess-1', baseAgent.task_title)
  })

  it('shows "Hide" when the conversation is open', () => {
    renderRow({ isSelected: true })
    const btn = screen.getByRole('button', { name: /hide conversation/i })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toBe('Hide')
  })

  it('offers Retry only for failed agents', () => {
    const onRetry = vi.fn()
    const { unmount } = renderRow({ onRetryTask: onRetry })
    expect(screen.queryByRole('button', { name: /retry task/i })).toBeNull()
    unmount()
    renderRow({ onRetryTask: onRetry, agent: { ...baseAgent, status: 'failed' } })
    fireEvent.click(screen.getByRole('button', { name: /retry task/i }))
    expect(onRetry).toHaveBeenCalledWith('task-1', baseAgent.task_title)
  })

  it('shows status, elapsed time, cost and counts in the meta line; details expand files, commits and tools', () => {
    renderRow({ execution })
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('02:00')).toBeTruthy()
    expect(screen.getByText('$0.05')).toBeTruthy()
    expect(screen.getByText('2 files')).toBeTruthy()
    expect(screen.getByText('1 commit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^details$/i }))
    expect(screen.getByText('src/a.ts')).toBeTruthy()
    expect(screen.getByText('abcdef1')).toBeTruthy()
    expect(screen.getByText('Read · Edit')).toBeTruthy()
    // long paths break instead of overflowing
    expect(screen.getByText(execution.files_modified[1]).className).toContain('break-all')
  })

  it('keeps "Open task" reachable in the ⋯ menu (no hover-only UI)', () => {
    renderRow()
    expect(screen.getByRole('button', { name: /actions for/i })).toBeTruthy()
  })
})
