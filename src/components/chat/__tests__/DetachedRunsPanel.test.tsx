import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DetachedRunsPanel } from '../DetachedRunsPanel'
import type { DetachedRun } from '@/hooks'

const getAgentExecutions = vi.fn()
vi.mock('@/services/chat', () => ({
  chatApi: { getAgentExecutions: (...a: unknown[]) => getAgentExecutions(...a) },
}))

function makeRun(overrides: Partial<DetachedRun> = {}): DetachedRun {
  return {
    sessionId: 's1',
    title: 'Child run',
    model: 'sonnet',
    isStreaming: false,
    startedAt: new Date(Date.now() - 5_000).toISOString(),
    ...overrides,
  }
}

function renderPanel(runs: DetachedRun[], handlers = { onViewRun: vi.fn(), onStopRun: vi.fn() }) {
  render(
    <MemoryRouter>
      <DetachedRunsPanel runs={runs} hasActiveRuns={runs.some(r => r.isStreaming)} {...handlers} />
    </MemoryRouter>,
  )
  return handlers
}

describe('DetachedRunsPanel', () => {
  beforeEach(() => {
    getAgentExecutions.mockReset()
    getAgentExecutions.mockResolvedValue([])
  })

  it('renders nothing without runs', () => {
    const { container } = render(<DetachedRunsPanel runs={[]} hasActiveRuns={false} onViewRun={vi.fn()} onStopRun={vi.fn()} />)
    expect(container.innerHTML).toBe("")
  })

  it('summarises active and completed runs and expands the list', () => {
    renderPanel([makeRun({ sessionId: 'a', isStreaming: true }), makeRun({ sessionId: 'b' })])
    expect(screen.getByText('1 run in progress')).toBeTruthy()
    expect(screen.getByText(/1 done/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByText('Child run')).toHaveLength(2)
  })

  it('shows completed count when nothing is streaming', () => {
    renderPanel([makeRun({ sessionId: 'a' }), makeRun({ sessionId: 'b' })])
    expect(screen.getByText('2 runs completed')).toBeTruthy()
  })

  it('views and stops a run from the row actions', () => {
    const h = renderPanel([makeRun({ isStreaming: true })])
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByLabelText('View run'))
    expect(h.onViewRun).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByLabelText('Stop run'))
    expect(h.onStopRun).toHaveBeenCalledWith('s1')
  })

  it('loads the executions of an expandable run, then reports none', async () => {
    renderPanel([makeRun({ runId: 'run-1' })])
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByText('Child run'))
    expect(screen.getByText('Loading executions…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No execution details available.')).toBeTruthy())
    expect(getAgentExecutions).toHaveBeenCalledWith('run-1')
    // collapse again
    fireEvent.click(screen.getByText('Child run'))
    expect(screen.queryByText('No execution details available.')).toBeNull()
  })

  it('falls back to no executions when the fetch fails', async () => {
    getAgentExecutions.mockRejectedValue(new Error('boom'))
    renderPanel([makeRun({ runId: 'run-2' })])
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByText('Child run'))
    await waitFor(() => expect(screen.getByText('No execution details available.')).toBeTruthy())
  })

  it('formats minutes and hours of duration and shows a reported cost', () => {
    renderPanel([
      makeRun({ sessionId: 'm', startedAt: new Date(Date.now() - 5 * 60_000).toISOString(), costUsd: 1.5 }),
      makeRun({ sessionId: 'h', startedAt: new Date(Date.now() - 125 * 60_000).toISOString() }),
    ])
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('5m')).toBeTruthy()
    expect(screen.getByText('2h 5m')).toBeTruthy()
    expect(screen.getByText(/1\.50/)).toBeTruthy()
  })
})
