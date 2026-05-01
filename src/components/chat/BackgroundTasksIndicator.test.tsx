/**
 * Unit tests for `<BackgroundTasksIndicator />` (F3 of plan 5985a7c4).
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import { chatBackgroundTasksAtom, chatSessionIdAtom } from '@/atoms'
import type { BackgroundTaskInfo, CancelTaskResult } from '@/types'

vi.mock('@/services/chat', () => {
  return {
    chatApi: {
      cancelTask: vi.fn<
        (sessionId: string, taskId: string) => Promise<CancelTaskResult>
      >(),
    },
  }
})

import { chatApi } from '@/services/chat'
import { BackgroundTasksIndicator } from './BackgroundTasksIndicator'

function withStore(store: ReturnType<typeof createStore>) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children)
}

const monitor = (id: string, description: string): BackgroundTaskInfo => ({
  id,
  kind: 'monitor',
  description,
  started_at: new Date(Date.now() - 5_000).toISOString(),
  last_seen_at: new Date().toISOString(),
  pid: null,
  parent_tool_use_id: id,
})

const bash = (id: string, description: string): BackgroundTaskInfo => ({
  id,
  kind: 'bash_background',
  description,
  started_at: new Date(Date.now() - 12_000).toISOString(),
  last_seen_at: new Date().toISOString(),
  pid: null,
  parent_tool_use_id: id,
})

describe('<BackgroundTasksIndicator />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no tasks are tracked', () => {
    const store = createStore()
    const { container } = render(<BackgroundTasksIndicator />, {
      wrapper: withStore(store),
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders only the Monitor count when no bash bg', () => {
    const store = createStore()
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })

    const trigger = screen.getByRole('button', { name: /1 background task running/i })
    expect(trigger).toHaveTextContent('1')
    expect(trigger.textContent ?? '').not.toContain('•')
  })

  it('renders both counts with separator when mixed', () => {
    const store = createStore()
    store.set(chatBackgroundTasksAtom, [
      monitor('toolu_M1', 'log A'),
      monitor('toolu_M2', 'log B'),
      bash('toolu_B1', 'cargo watch'),
    ])

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })

    const trigger = screen.getByRole('button', { name: /3 background tasks running/i })
    expect(trigger.textContent).toContain('2')
    expect(trigger.textContent).toContain('1')
    expect(trigger.textContent ?? '').toContain('•')
  })

  it('renders one row per task in the popover with description', () => {
    const store = createStore()
    store.set(chatBackgroundTasksAtom, [
      monitor('toolu_M1', 'tail /tmp/build.log'),
      bash('toolu_B1', 'cargo watch -x test'),
    ])

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })

    expect(screen.getByText('tail /tmp/build.log')).toBeInTheDocument()
    expect(screen.getByText('cargo watch -x test')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Stop /, hidden: true })).toHaveLength(2)
  })

  it('calls cancelTask when the per-task Stop button is clicked', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-42')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [],
      capped: false,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(chatApi.cancelTask).toHaveBeenCalledWith('sess-42', 'toolu_M1')
    })
  })

  it('surfaces a rate-cap message when cancel returns capped:true', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-cap')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [],
      capped: true,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(screen.getByText(/cancelling too fast/i)).toBeInTheDocument()
    })
  })

  it('surfaces an error message when cancelTask rejects', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-fail')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockRejectedValueOnce(new Error('boom'))

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(screen.getByText(/failed to cancel task/i)).toBeInTheDocument()
    })
  })

  // ====================================================================
  // T8 of plan fc35b25e — V2 kill confirmation feedback
  // ====================================================================

  it('flashes a success confirmation when killed_pids is non-empty (V2 happy path)', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-v2-ok')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [12345, 12346],
      capped: false,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(screen.getByText(/stopped 2 subprocesses/i)).toBeInTheDocument()
    })
    // Should NOT surface the fallback warning at the same time.
    expect(screen.queryByText(/subprocess pid wasn['’]t known/i)).not.toBeInTheDocument()
  })

  it('uses singular wording when killed_pids has exactly 1 entry', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-v2-1')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [12345],
      capped: false,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      // Match "1 subprocess." but not "1 subprocesses." — assert the
      // grammar gates on count===1.
      const message = screen.getByText(/stopped 1 subprocess\./i)
      expect(message).toBeInTheDocument()
    })
  })

  it('flashes a fallback warning when killed_pids is empty (V2 claim race)', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-v2-fallback')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [],
      capped: false,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(
        screen.getByText(/subprocess pid wasn['’]t known/i),
      ).toBeInTheDocument()
    })
    // The success confirmation must NOT appear in the fallback case.
    expect(screen.queryByText(/^Stopped \d+ subprocess/i)).not.toBeInTheDocument()
  })

  it('does not flash success/fallback when capped:true (cap path owns the message)', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'sess-v2-cap')
    store.set(chatBackgroundTasksAtom, [monitor('toolu_M1', 'tail log')])
    vi.mocked(chatApi.cancelTask).mockResolvedValueOnce({
      task_id: 'toolu_M1',
      killed_pids: [],
      capped: true,
    })

    render(<BackgroundTasksIndicator />, { wrapper: withStore(store) })
    fireEvent.click(screen.getByRole('button', { name: /^Stop tail log/, hidden: true }))

    await waitFor(() => {
      expect(screen.getByText(/cancelling too fast/i)).toBeInTheDocument()
    })
    // Neither V2 feedback variant should appear when the cap won.
    expect(screen.queryByText(/^Stopped \d+ subprocess/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/subprocess pid wasn['’]t known/i),
    ).not.toBeInTheDocument()
  })
})
