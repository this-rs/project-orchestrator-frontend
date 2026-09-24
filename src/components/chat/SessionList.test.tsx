/**
 * Render sanity tests for <SessionList /> with realistic data: child sessions,
 * runner-spawned sessions, many linked entities, long titles, missing title.
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import type { ChatSession } from '@/types'

const hoisted = vi.hoisted(() => {
  // jsdom has no CSS.supports — Select probes it at module load.
  const g = globalThis as { CSS?: { supports?: unknown } }
  g.CSS = { ...(g.CSS ?? {}), supports: () => false }
  return {
    listSessions: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    searchMessages: vi.fn(),
    listProjects: vi.fn(),
    detachedRuns: new Map<string, { sessionId: string; title: string; model: string; isStreaming: boolean; startedAt: string }[]>(),
  }
})

vi.mock('@/services', () => ({
  chatApi: {
    listSessions: hoisted.listSessions,
    deleteSession: hoisted.deleteSession,
    renameSession: hoisted.renameSession,
    searchMessages: hoisted.searchMessages,
  },
  workspacesApi: { listProjects: hoisted.listProjects },
  getEventBus: () => ({ on: () => () => {} }),
}))

vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'main-ws',
  useActiveRunTracker: () => new Map([['s-parent', { runCount: 2, hasStreaming: true }]]),
  useDetachedRuns: (id: string) => ({
    runs: hoisted.detachedRuns.get(id) ?? [],
    isLoading: false,
    hasActiveRuns: false,
    refresh: () => {},
  }),
}))

import { SessionList } from './SessionList'

const now = Date.now()
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

function session(partial: Partial<ChatSession> & { id: string }): ChatSession {
  return {
    cwd: '/Users/alice/projects/app',
    model: 'claude-opus-4-5-20251101',
    created_at: iso(3_600_000),
    updated_at: iso(60_000),
    message_count: 4,
    ...partial,
  }
}

const SESSIONS: ChatSession[] = [
  session({
    id: 's-parent',
    title: 'Refactor the session list so that it is cleaner on phones while keeping every single piece of information',
    preview: 'Let us start with an inventory',
    workspace_slug: 'main-ws',
    permission_mode: 'bypassPermissions',
    total_cost_usd: 1.234,
    linked_plans: [{ id: 'p1', title: 'Plan one', source: 'manual' }],
    linked_rfcs: [{ id: 'r1', title: 'RFC one' }],
  }),
  session({
    id: 's-runner',
    title: 'Runner task',
    project_slug: 'backend',
    spawned_by: { type: 'runner', run_id: 'run', plan_id: 'p1' },
    linked_plans: [
      { id: 'p1', title: 'Plan one', source: 'runner' },
      { id: 'p2', title: 'Plan two', source: 'runner' },
    ],
    linked_tasks: [
      { id: 't1', title: 'Task one', source: 'runner' },
      { id: 't2', title: 'Task two', source: 'runner' },
    ],
  }),
  session({ id: 'abcdef1234567890', title: undefined, preview: undefined, updated_at: iso(40 * 86_400_000), cwd: '' }),
]

/** The session row (not the "Active runs" shortcut, which repeats the parent title). */
function sessionRow(name: string | RegExp): HTMLElement {
  const row = screen.getAllByRole('button', { name }).find((el) => el.tagName === 'DIV')
  if (!row) throw new Error(`no session row for ${String(name)}`)
  return row
}

function withStore() {
  const store = createStore()
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
}

beforeAll(() => {
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal('IntersectionObserver', IO)
})

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.listSessions.mockResolvedValue({ items: SESSIONS, has_more: false })
  hoisted.listProjects.mockResolvedValue([])
  hoisted.searchMessages.mockResolvedValue([])
  hoisted.deleteSession.mockResolvedValue(undefined)
  hoisted.detachedRuns.clear()
  hoisted.detachedRuns.set('s-parent', [
    { sessionId: 'child-1', title: 'Child run', model: 'm', isStreaming: true, startedAt: iso(65 * 60_000) },
  ])
})

describe('<SessionList />', () => {
  it('renders realistic sessions with all metadata', async () => {
    render(<SessionList activeSessionId="s-parent" onSelect={vi.fn()} onClose={vi.fn()} embedded />, { wrapper: withStore() })

    await screen.findByText('Runner task')
    const parentRow = sessionRow(/Refactor the session list/)
    expect(parentRow).toHaveAttribute('aria-current', 'true')

    const p = within(parentRow)
    expect(p.getByText('Let us start with an inventory')).toBeInTheDocument()
    expect(p.getByText('main-ws')).toBeInTheDocument()
    expect(p.getByText('4 msgs')).toBeInTheDocument()
    expect(p.getByText('opus-4-5')).toBeInTheDocument()
    expect(p.getByRole('img', { name: 'Bypass permissions' })).toBeInTheDocument()
    expect(p.getByText('$1.23')).toBeInTheDocument()
    expect(p.getByText('~/projects/app')).toBeInTheDocument()
    expect(p.getByRole('link', { name: 'Plan: Plan one' })).toHaveAttribute('href', expect.stringContaining('/plans/p1'))
    expect(p.getByRole('link', { name: 'RFC: RFC one' })).toBeInTheDocument()
    expect(p.getByText('1m')).toBeInTheDocument()

    // Child sessions: collapsed count, expandable list
    fireEvent.click(p.getByRole('button', { name: /1 child/ }))
    expect(p.getByText('Child run')).toBeInTheDocument()
    expect(p.getByText('1h 5m')).toBeInTheDocument()

    // Runner session: origin label + compact linked entities (4 > threshold)
    const runnerRow = sessionRow('Runner task')
    const r = within(runnerRow)
    expect(r.getByText('runner')).toBeInTheDocument()
    expect(r.getByText('backend')).toBeInTheDocument()
    expect(r.getByLabelText('2 Plans')).toBeInTheDocument()
    expect(r.getByLabelText('2 Tasks')).toBeInTheDocument()
    expect(r.queryByRole('link', { name: 'Task: Task two' })).not.toBeInTheDocument()
    fireEvent.click(r.getByRole('button', { name: 'more' }))
    expect(r.getByRole('link', { name: 'Task: Task two' })).toBeInTheDocument()

    // Untitled session falls back to a short id; grouped under Previous 30 days/Older
    expect(screen.getByText('Session abcdef12')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Older' })).toBeInTheDocument()

    // Active runs section
    expect(screen.getByRole('region', { name: 'Active runs' })).toBeInTheDocument()
    expect(screen.getByText('2 runs in progress')).toBeInTheDocument()
  })

  it('selects a session on tap and closes when tapping the active one', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<SessionList activeSessionId="s-parent" onSelect={onSelect} onClose={onClose} embedded />, { wrapper: withStore() })

    fireEvent.click(await screen.findByText('Runner task'))
    expect(onSelect).toHaveBeenCalledWith('s-runner', undefined, 'Runner task')

    fireEvent.click(sessionRow(/Refactor the session list/))
    expect(onClose).toHaveBeenCalled()
  })

  it('exposes rename and delete through an always-visible actions button', async () => {
    const onSelect = vi.fn()
    render(<SessionList activeSessionId={null} onSelect={onSelect} onClose={vi.fn()} embedded />, { wrapper: withStore() })

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Runner task' }))
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    // Confirmation step
    expect(screen.getByText('Delete this conversation?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(hoisted.deleteSession).toHaveBeenCalledWith('s-runner'))
    await waitFor(() => expect(screen.queryByText('Runner task')).not.toBeInTheDocument())
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Session abcdef12' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(screen.getByRole('textbox', { name: 'Conversation title' })).toHaveValue('Session abcdef12')
  })

  it('shows an active-filter summary with a clear action', async () => {
    render(<SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />, { wrapper: withStore() })
    await screen.findByText('Runner task')

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('switch', { name: /Show spawned sessions/ }))

    expect(screen.queryByText('Runner task')).not.toBeInTheDocument()
    expect(screen.getByText('spawned hidden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Runner task')).toBeInTheDocument()
  })
})
