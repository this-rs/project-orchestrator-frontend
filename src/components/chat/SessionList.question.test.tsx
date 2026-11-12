/**
 * A conversation whose open question awaits the person shows it on its row,
 * with an accessible name. Other waits (a permission) do not.
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import type { ChatSession, SessionActivity } from '@/types'

const hoisted = vi.hoisted(() => {
  const g = globalThis as { CSS?: { supports?: unknown } }
  g.CSS = { ...(g.CSS ?? {}), supports: () => false }
  return {
    listSessions: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    searchMessages: vi.fn(),
    getLiveActivity: vi.fn(),
    listProjects: vi.fn(),
    /** Subscribers of the fake CRUD event bus. */
    busHandlers: new Set<(e: CrudEvent) => void>(),
  }
})

vi.mock('@/services', () => ({
  chatApi: {
    listSessions: hoisted.listSessions,
    deleteSession: hoisted.deleteSession,
    renameSession: hoisted.renameSession,
    searchMessages: hoisted.searchMessages,
    getLiveActivity: hoisted.getLiveActivity,
  },
  workspacesApi: { listProjects: hoisted.listProjects },
  getEventBus: () => ({
    on: (fn: (e: CrudEvent) => void) => {
      hoisted.busHandlers.add(fn)
      return () => hoisted.busHandlers.delete(fn)
    },
  }),
}))

vi.mock('@/hooks', () => ({
  useWorkspaceSlug: () => 'main-ws',
  useActiveRunTracker: () => new Map(),
  useDetachedRuns: () => ({ runs: [], isLoading: false, hasActiveRuns: false, refresh: () => {} }),
}))

import { SessionList } from './SessionList'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function session(id: string, title: string, extra: Partial<ChatSession> = {}): ChatSession {
  return {
    id,
    title,
    cwd: '/Users/alice/app',
    model: 'claude-opus-4-5-20251101',
    created_at: iso(3_600_000),
    updated_at: iso(60_000),
    message_count: 4,
    preview: `preview of ${title}`,
    workspace_slug: 'main-ws',
    ...extra,
  }
}

const activity = (p: Partial<SessionActivity> = {}): SessionActivity => ({
  live: true,
  streaming: false,
  pending_permissions: 0,
  monitors: 0,
  bash_tasks: 0,
  ...p,
})

const PAGE_ONE = [session('s-1', 'First conversation'), session('s-2', 'Second conversation')]

function withStore(store = createStore()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children)
  return { store, wrapper }
}

/**
 * The row element that owns a given title. The row itself is a DIV with
 * `role="button"`; its overflow trigger is a real BUTTON with the same
 * accessible name, hence the tag filter (same helper as SessionList.test).
 */
function row(title: RegExp | string): HTMLElement {
  const found = screen.getAllByRole('button', { name: title }).find((el) => el.tagName === 'DIV')
  if (!found) throw new Error(`no session row for ${String(title)}`)
  return found
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
  hoisted.busHandlers.clear()
  hoisted.listSessions.mockResolvedValue({ items: PAGE_ONE, has_more: false })
  hoisted.listProjects.mockResolvedValue([])
  hoisted.searchMessages.mockResolvedValue([])
  hoisted.getLiveActivity.mockResolvedValue({ generated_at: iso(0), sessions: {} })
})


/** A live activity whose verdict is the given state and rule. */
const asked = (rule: string, state: SessionActivity['state'] = 'waiting_on_person'): SessionActivity =>
  activity({ state, state_reason: { rule } })

describe('a conversation with a question awaiting an answer says so in the list', () => {
  it('shows the indicator on the row whose open question awaits the person', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [session('s-1', 'First conversation', { activity: asked('question_open') }), session('s-2', 'Second conversation')],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    await screen.findByText('First conversation')
    expect(within(row(/First conversation/)).getByRole('status', { name: 'Waiting for you' })).toBeInTheDocument()
    expect(within(row(/Second conversation/)).queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not show it for a person awaited for another reason', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [session('s-1', 'First conversation', { activity: asked('permission_pending') })],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    const r = await waitFor(() => row(/First conversation/))
    expect(within(r).queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not also say "Idle — waiting for you" under the badge', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [session('s-1', 'First conversation', { activity: asked('question_open') })],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    const r = await waitFor(() => row(/First conversation/))
    expect(within(r).getByRole('status', { name: 'Waiting for you' })).toBeInTheDocument()
    expect(within(r).queryByText(/Idle/)).not.toBeInTheDocument()
  })
})

describe('the open question is read from the live-activity snapshot too', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The list polls only while something is live: the listing says s-1 is streaming, the snapshot then gives its verdict. */
  async function mountWithSnapshot(verdict: Partial<SessionActivity>) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    hoisted.listSessions.mockResolvedValue({
      items: [session('s-1', 'First conversation', { activity: activity({ streaming: true }) })],
      has_more: false,
    })
    hoisted.getLiveActivity.mockResolvedValue({
      generated_at: iso(0),
      sessions: { 's-1': activity({ streaming: false, ...verdict }) },
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    await screen.findByText('First conversation')
    // One poll interval: the first tick reads getLiveActivity and replaces the map.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(hoisted.getLiveActivity).toHaveBeenCalled()
    return row(/First conversation/)
  }

  it('shows the badge when the snapshot says the open question awaits the person', async () => {
    const r = await mountWithSnapshot({ state: 'waiting_on_person', state_reason: { rule: 'question_open' } })
    expect(within(r).getByRole('status', { name: 'Waiting for you' })).toBeInTheDocument()
  })

  it.each([
    ['a null state', { state: null, state_reason: null }],
    ['an unknown state', { state: 'some_future_state', state_reason: { rule: 'question_open' } }],
  ] as const)('shows no badge when the snapshot carries %s', async (_label, verdict) => {
    const r = await mountWithSnapshot(verdict as Partial<SessionActivity>)
    expect(within(r).queryByRole('status')).not.toBeInTheDocument()
  })
})
