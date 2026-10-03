/**
 * Two defects of the conversation list, each pinned by a test that fails
 * without its fix.
 *
 * A — A conversation changing state repainted the whole list. Any
 *     `chat_session` CRUD event bumps `chatSessionRefreshAtom`, and the list's
 *     refresh effect ran the *initial* load path: `setLoading(true)` replaced
 *     every row with a single "Loading..." spinner — unmounting the subtree,
 *     so expanded rows collapsed and one `useDetachedRuns` request per row
 *     fired again — and `offsetRef = 0` dropped every page past the first.
 *
 * B — The working indicator was built only from events received while the
 *     list was mounted. A list opened mid-turn showed a working conversation
 *     as idle, and nothing ever said what a non-streaming but still-running
 *     session was waiting on.
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Provider, createStore } from 'jotai'
import { chatSessionRefreshAtom } from '@/atoms'
import type { ChatSession, CrudEvent, SessionActivity } from '@/types'

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

function emit(event: CrudEvent) {
  act(() => {
    for (const fn of hoisted.busHandlers) fn(event)
  })
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

/**
 * Listing calls that actually paint the list. The plan/RFC filter options are
 * loaded with a second, unpaginated `listSessions(limit: 100)` call, which is
 * not what these tests are about.
 */
function listCalls(): { limit: number; offset: number }[] {
  return hoisted.listSessions.mock.calls
    .map((c) => c[0] as { limit: number; offset: number })
    .filter((params) => params && params.limit !== 100)
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

describe('a conversation changing state does not repaint the list', () => {
  it('shows no spinner and keeps the very same row elements', async () => {
    const { store, wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    await screen.findByText('First conversation')
    const before = row(/First conversation/)

    // Exactly what a state change does: the CRUD handler bumps the atom.
    act(() => store.set(chatSessionRefreshAtom, (c) => c + 1))

    // The defect: `setLoading(true)` put this on screen in place of the list.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    await waitFor(() => expect(listCalls()).toHaveLength(2))
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()

    // Same DOM node: the subtree was updated, never unmounted and rebuilt.
    expect(row(/First conversation/)).toBe(before)
    expect(document.contains(before)).toBe(true)
  })

  it('re-reads the whole window the user scrolled through, not just the first page', async () => {
    // 45 sessions already loaded (two pages' worth).
    const many = Array.from({ length: 45 }, (_, i) => session(`s-${i}`, `Conversation ${i}`))
    hoisted.listSessions.mockResolvedValue({ items: many, has_more: true })

    const { store, wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    await screen.findByText('Conversation 0')

    act(() => store.set(chatSessionRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(listCalls()).toHaveLength(2))

    // The defect reset the offset and asked for one page: the list silently
    // shrank from 45 rows back to 30 and the scroll position jumped.
    const params = listCalls()[1]
    expect(params.offset).toBe(0)
    expect(params.limit).toBe(45)
    expect(screen.getByText('Conversation 44')).toBeInTheDocument()
  })

  it('leaves a quiet neighbour untouched when one conversation starts working', async () => {
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    await screen.findByText('Second conversation')
    const second = row(/Second conversation/)

    emit({
      entity_type: 'chat_session',
      entity_id: 's-1',
      action: 'updated',
      payload: { is_streaming: true },
    } as unknown as CrudEvent)

    expect(within(row(/First conversation/)).getByText('Working…')).toBeInTheDocument()
    // The other row kept its node and its preview: nothing about it changed.
    expect(row(/Second conversation/)).toBe(second)
    expect(within(second).getByText('preview of Second conversation')).toBeInTheDocument()
  })
})

describe('the working state is read from the server, not guessed from events', () => {
  it('says "Working…" at mount for a turn that started before the list existed', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [
        session('s-1', 'First conversation', { activity: activity({ streaming: true }) }),
        session('s-2', 'Second conversation'),
      ],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    // No event is ever emitted in this test — this is the reload case.
    await screen.findByText('First conversation')
    expect(within(row(/First conversation/)).getByText('Working…')).toBeInTheDocument()
    expect(within(row(/Second conversation/)).queryByText('Working…')).not.toBeInTheDocument()
  })

  it('names the watch a session is waiting on instead of showing a stale preview', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [session('s-1', 'First conversation', { activity: activity({ monitors: 2 }) })],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    const r = await waitFor(() => row(/First conversation/))
    expect(within(r).getByText('Watching 2 targets')).toBeInTheDocument()
    expect(within(r).queryByText('preview of First conversation')).not.toBeInTheDocument()
  })

  it('shows a pending approval as the thing the user must act on', async () => {
    hoisted.listSessions.mockResolvedValue({
      items: [
        session('s-1', 'First conversation', {
          activity: activity({ streaming: true, pending_permissions: 1 }),
        }),
      ],
      has_more: false,
    })
    const { wrapper } = withStore()
    render(
      <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
      { wrapper },
    )
    const r = await waitFor(() => row(/First conversation/))
    expect(within(r).getByText(/Waiting for your approval/)).toBeInTheDocument()
  })

  it('clears a working state the server no longer reports — a stuck dot cannot survive', async () => {
    vi.useFakeTimers()
    try {
      hoisted.listSessions.mockResolvedValue({
        items: [session('s-1', 'First conversation', { activity: activity({ streaming: true }) })],
        has_more: false,
      })
      // The turn has ended, and the "stopped" event never arrived.
      hoisted.getLiveActivity.mockResolvedValue({ generated_at: iso(0), sessions: {} })

      const { wrapper } = withStore()
      render(
        <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
        { wrapper },
      )
      await vi.waitFor(() => expect(screen.getByText('Working…')).toBeInTheDocument())

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000)
      })
      await vi.waitFor(() => expect(hoisted.getLiveActivity).toHaveBeenCalled())
      await vi.waitFor(() => expect(screen.queryByText('Working…')).not.toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not poll at all while every conversation is quiet', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = withStore()
      render(
        <SessionList activeSessionId={null} onSelect={vi.fn()} onClose={vi.fn()} embedded />,
        { wrapper },
      )
      await vi.waitFor(() => expect(screen.getByText('First conversation')).toBeInTheDocument())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(hoisted.getLiveActivity).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
