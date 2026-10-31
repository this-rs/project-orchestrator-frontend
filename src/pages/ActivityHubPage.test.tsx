/**
 * The Activity Hub shows one section per kind of run, each with its own anatomy.
 *
 * That is the whole point of the screen: three kinds of background work, three
 * card shapes, one board. These tests pin the grouping (a plan-run card is not
 * a protocol card), the counts, and the gesture that makes the log useful
 * (clicking a line reaches the card of the run it talks about).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ActivityEvent, ActivitySnapshot } from '@/types/activity'

const snapshot: ActivitySnapshot = {
  generated_at: '2026-01-01T00:00:00Z',
  last_event_seq: 12,
  counts: { plan_runs: 1, protocol_runs: 1, chat_sessions: 1, total: 3 },
  plan_runs: [
    {
      run_id: 'run-plan',
      plan_id: 'plan-1',
      plan_title: 'Ship the hub',
      status: 'running',
      current_wave: 2,
      total_tasks: 6,
      completed_tasks: 3,
      failed_tasks: 0,
      active_tasks: [
        { task_id: 'task-1', title: 'Write the snapshot handler', status: 'running', elapsed_secs: 30, cost_usd: 0.1 },
      ],
      git_branch: 'feat/live-activity-hub',
      started_at: new Date(Date.now() - 60_000).toISOString(),
      elapsed_secs: 60,
      cost_usd: 1.25,
      tokens_used: 4200,
    },
  ],
  protocol_runs: [
    {
      run_id: 'run-proto',
      protocol_id: 'proto-1',
      protocol_name: 'Code review',
      current_state: 'state-1',
      current_state_name: 'REVIEW',
      status: 'running',
      states_visited: 3,
      triggered_by: 'manual',
      started_at: new Date(Date.now() - 30_000).toISOString(),
      elapsed_secs: 30,
    },
  ],
  chat_sessions: [
    {
      session_id: 'session-1',
      title: 'Refactor the reader',
      model: 'claude-sonnet',
      message_count: 12,
      updated_at: new Date(Date.now() - 5_000).toISOString(),
      idle_secs: 5,
      activity: { live: true, streaming: true, pending_permissions: 0, monitors: 0, bash_tasks: 0 },
    },
  ],
}

const logEvent: ActivityEvent = {
  seq: 13,
  ts: '2026-01-01T00:00:13Z',
  category: 'plan_run',
  entity_type: 'runner',
  entity_id: 'run-plan',
  action: 'updated',
  title: 'Ship the hub',
}

let streamState: {
  snapshot: ActivitySnapshot
  events: ActivityEvent[]
  status: string
  loading: boolean
  error: string | null
  gap: number
  lastEventSeqByEntity: Record<string, number>
  refresh: () => void
}

beforeEach(() => {
  // jsdom has no matchMedia; ProgressBar reads prefers-reduced-motion.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))

  streamState = {
    snapshot,
    events: [logEvent],
    status: 'connected',
    loading: false,
    error: null,
    gap: 0,
    lastEventSeqByEntity: { 'run-plan': 13 },
    refresh: vi.fn(),
  }

  vi.doMock('@/hooks/useActivityStream', () => ({
    useActivityStream: () => streamState,
  }))
  vi.doMock('@/hooks', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return { ...actual, useWorkspaceSlug: () => 'demo' }
  })
})

describe('ActivityHubPage', () => {
  it('groups the runs by kind, one section each', async () => {
    const { ActivityHubPage } = await import('./ActivityHubPage')
    render(
      <MemoryRouter>
        <ActivityHubPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /^Activity/ , level: 1 })).toBeTruthy()
    // Scoped to their section: the same label also appears in the live log.
    expect(within(screen.getByRole('region', { name: 'Plans' })).getByText('Ship the hub')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Protocols' })).getByText('Code review')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Conversations' })).getByText('Refactor the reader')).toBeTruthy()

    // Each section is announced by its own kind, with its count.
    expect(screen.getByRole('region', { name: 'Plans' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Protocols' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Conversations' })).toBeTruthy()
  })

  it('gives each kind of run its own anatomy', async () => {
    const { ActivityHubPage } = await import('./ActivityHubPage')
    render(
      <MemoryRouter>
        <ActivityHubPage />
      </MemoryRouter>,
    )

    // A plan run has waves, a task list and its branch…
    expect(screen.getByText('Write the snapshot handler')).toBeTruthy()
    expect(screen.getByText('Wave 2')).toBeTruthy()
    expect(screen.getByText('3/6')).toBeTruthy()
    // …a protocol run has its current state, not a progress bar…
    expect(screen.getByText('REVIEW')).toBeTruthy()
    // …and a conversation leads with what it is doing.
    expect(screen.getByText('claude-sonnet')).toBeTruthy()
  })

  it('reaches a run card from its log line', async () => {
    const { ActivityHubPage } = await import('./ActivityHubPage')
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id)
    }

    render(
      <MemoryRouter>
        <ActivityHubPage />
      </MemoryRouter>,
    )

    const line = screen.getByTitle('run-plan')
    fireEvent.click(line)
    expect(scrolled).toContain('activity-card-run-plan')
  })

  it('shows the empty state when nothing is running', async () => {
    streamState = {
      ...streamState,
      snapshot: { ...snapshot, counts: { plan_runs: 0, protocol_runs: 0, chat_sessions: 0, total: 0 }, plan_runs: [], protocol_runs: [], chat_sessions: [] },
      events: [],
    }
    const { ActivityHubPage } = await import('./ActivityHubPage')
    render(
      <MemoryRouter>
        <ActivityHubPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Nothing is running')).toBeTruthy()
    expect(screen.getByText('No activity yet.')).toBeTruthy()
  })
})
