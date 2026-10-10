/**
 * The activity bar above the composer: what it shows collapsed, what a row
 * offers, and what a Stop click reports. The rules deciding WHICH activities
 * are listed are tested without a DOM in `runningActivity.test.ts`.
 *
 * Run with: npx vitest run src/components/chat/ActivityBar.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionIdAtom } from '@/atoms'
import type { CancelTaskResult } from '@/types'

vi.mock('@/services/chat', () => ({
  chatApi: { cancelTask: vi.fn<(sessionId: string, taskId: string) => Promise<CancelTaskResult>>() },
}))

import { chatApi } from '@/services/chat'
import { ApiError } from '@/services/api'
import { ActivityBar, type RunActions } from './ActivityBar'
import type { RunningItem } from './runningActivity'

const started = new Date(Date.now() - 12_000).toISOString()
const workflow: RunningItem = { id: 'w1', kind: 'workflow', title: 'review-changes', startedAt: started, progress: { settled: 3, total: 8 }, anchorId: 'w1' }
const agent: RunningItem = { id: 'a1', kind: 'agent', title: 'Map the backend', startedAt: started, anchorId: 'a1' }
const agent2: RunningItem = { id: 'a2', kind: 'agent', title: 'Plan the slices', anchorId: 'a2' }
const monitor: RunningItem = { id: 'm1', kind: 'monitor', title: 'tail -f ci.log', startedAt: started, anchorId: 'm1', taskId: 'm1' }
const shell: RunningItem = { id: 's1', kind: 'shell', title: 'npm run dev', startedAt: started, anchorId: 's1', taskId: 's1' }

function mount(items: RunningItem[], runActions?: RunActions) {
  const store = createStore()
  store.set(chatSessionIdAtom, 'session-1')
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
  const view = render(<ActivityBar items={items} runActions={runActions} />, { wrapper })
  return { ...view, setItems: (next: RunningItem[]) => view.rerender(<ActivityBar items={next} />) }
}

const expand = () => fireEvent.click(screen.getByRole('button', { name: /^Running:/ }))

describe('<ActivityBar />', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when nothing runs', () => {
    const { container } = mount([])
    expect(container).toBeEmptyDOMElement()
  })

  it('summarises a count per kind, singular and plural, with the sole workflow progress', () => {
    mount([workflow, agent, agent2, monitor])
    const summary = screen.getByRole('button', { name: 'Running: 1 workflow, 2 agents, 1 monitor' })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(summary).toHaveTextContent('1 workflow 3/8')
    expect(summary).toHaveTextContent('2 agents')
    expect(summary).toHaveTextContent('1 monitor')
    expect(summary).not.toHaveTextContent('shell')
  })

  it('does not pick one progress when several workflows run', () => {
    mount([workflow, { ...workflow, id: 'w2', progress: { settled: 1, total: 2 } }])
    const summary = screen.getByRole('button', { name: 'Running: 2 workflows' })
    expect(summary).not.toHaveTextContent('3/8')
  })

  it('is collapsed by default and lists one row per activity when opened', () => {
    mount([workflow, agent, shell])
    expect(screen.queryByText('Map the backend')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expand()
    expect(screen.getByRole('button', { name: /^Running:/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('review-changes')).toBeInTheDocument()
    expect(screen.getByText('3/8 agents')).toBeInTheDocument()
    expand()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('offers Stop only where the backend can stop that one thing', () => {
    mount([workflow, agent, shell])
    expand()
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop review-changes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop Map the backend' })).toBeNull()
  })

  it('a run row opens its conversation, its dashboard, and stops it', () => {
    const actions: RunActions = { view: vi.fn(), stop: vi.fn(), dashboard: vi.fn() }
    const planRun: RunningItem = { id: 'r1', kind: 'run', title: 'Plan run', sessionId: 'r1', planId: 'p1' }
    const delegated: RunningItem = { id: 'r2', kind: 'run', title: 'Delegated', sessionId: 'r2' }
    mount([planRun, delegated, shell], actions)
    expect(screen.getByRole('button', { name: 'Running: 2 runs, 1 shell' })).toBeInTheDocument()
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Open the conversation of Plan run' }))
    expect(actions.view).toHaveBeenCalledWith('r1')
    fireEvent.click(screen.getByRole('button', { name: 'Open the runner dashboard of Plan run' }))
    expect(actions.dashboard).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByRole('button', { name: 'Stop Plan run' }))
    expect(actions.stop).toHaveBeenCalledWith('r1')
    expect(chatApi.cancelTask).not.toHaveBeenCalled()
    // No plan, no dashboard; and a run has no block in this transcript to scroll to.
    expect(screen.queryByRole('button', { name: 'Open the runner dashboard of Delegated' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show Plan run in the conversation' })).toBeNull()
  })

  it('offers no run action when the host gave none', () => {
    mount([{ id: 'r1', kind: 'run', title: 'Plan run', sessionId: 'r1', planId: 'p1' }])
    expand()
    expect(screen.queryByRole('button', { name: 'Stop Plan run' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open the conversation of Plan run' })).toBeNull()
  })

  it('scrolls the transcript to the tool call an activity came from', () => {
    const target = document.createElement('div')
    target.setAttribute('data-tool-call-id', 'a1')
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)
    mount([agent])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Show Map the backend in the conversation' }))
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
    target.remove()
  })

  it('scrolls to the group that stands for an orphan background block', () => {
    const group = document.createElement('div')
    group.setAttribute('data-activity-anchors', 'orphan-0 orphan-1')
    group.scrollIntoView = vi.fn()
    document.body.appendChild(group)
    mount([{ ...workflow, anchorId: 'orphan-1' }])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Show review-changes in the conversation' }))
    expect(group.scrollIntoView).toHaveBeenCalledTimes(1)
    group.remove()
  })

  it('has no "show" button for an activity without an anchor, and a missing target is a no-op', () => {
    mount([{ ...agent, anchorId: undefined }, { ...agent2, anchorId: 'not-rendered' }])
    expand()
    expect(screen.queryByRole('button', { name: 'Show Map the backend in the conversation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Plan the slices in the conversation' }))
  })

  it('calls cancelTask for the row, says "stopping…" until the task leaves, and confirms the kill', async () => {
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 'm1', killed_pids: [10, 11], capped: false })
    const { setItems } = mount([monitor, shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop tail -f ci.log' }))
    expect(chatApi.cancelTask).toHaveBeenCalledWith('session-1', 'm1')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Stopped 2 subprocesses.'))
    const row = screen.getByText('tail -f ci.log').closest('li')!
    expect(within(row).getByText('stopping…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop tail -f ci.log' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeEnabled()

    // The task leaves the snapshot; the same id coming back later is a new task, not "stopping".
    setItems([shell])
    setItems([monitor, shell])
    expect(screen.getByRole('button', { name: 'Stop tail -f ci.log' })).toBeEnabled()
  })

  it('uses the singular for one subprocess', async () => {
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 's1', killed_pids: [10], capped: false })
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Stopped 1 subprocess.'))
  })

  it('warns when the cancel was registered without a known pid', async () => {
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 's1', killed_pids: [], capped: false })
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/PID wasn’t known/))
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeDisabled()
  })

  it('when the rate cap refuses the cancel, says so and re-enables Stop', async () => {
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({ task_id: 's1', killed_pids: [], capped: true })
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Cancelling too fast'))
    expect(screen.getByRole('status')).not.toHaveTextContent('Stopped')
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeEnabled()
  })

  it('when the cancel fails, says so and re-enables Stop', async () => {
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(new Error('boom'))
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Failed to cancel task'))
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeEnabled()
  })

  it('a 409 owner_unreachable reads "already stopped", not a failure', async () => {
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(
      new ApiError(409, JSON.stringify({ error: 'no instance holds this session', code: 'owner_unreachable', retryable: false })),
    )
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Already stopped — nothing was running any more.'))
    expect(screen.getByRole('status')).toHaveAttribute('data-feedback', 'stopped')
    expect(screen.getByRole('status')).not.toHaveTextContent('Failed to cancel task')
  })

  it('a retryable refusal (504 owner_timeout, retryable:true) invites a retry', async () => {
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(
      new ApiError(504, JSON.stringify({ error: 'no answer in time', code: 'owner_timeout', retryable: true })),
    )
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Not stopped yet — try again in a moment.'))
    expect(screen.getByRole('button', { name: 'Stop npm run dev' })).toBeEnabled()
  })

  it('a non-retryable failure (502 relay_failed) keeps the generic failure', async () => {
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(
      new ApiError(502, JSON.stringify({ error: 'could not send', code: 'relay_failed', retryable: false })),
    )
    mount([shell])
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Failed to cancel task'))
  })

  it('clears the confirmation after a moment, and the latest click replaces the previous message', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(chatApi.cancelTask)
        .mockResolvedValueOnce({ task_id: 's1', killed_pids: [], capped: true })
        .mockResolvedValueOnce({ task_id: 's1', killed_pids: [1], capped: false })
      mount([shell])
      expand()
      fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('status')).toHaveTextContent('Cancelling too fast')
      fireEvent.click(screen.getByRole('button', { name: 'Stop npm run dev' }))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('status')).toHaveTextContent('Stopped 1 subprocess.')
      await act(() => vi.advanceTimersByTimeAsync(2600))
      expect(screen.queryByRole('status')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
