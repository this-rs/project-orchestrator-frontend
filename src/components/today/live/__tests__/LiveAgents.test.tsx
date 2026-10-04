import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import type { LiveAgent, LiveAgentsResponse } from '@/types/liveAgents'

const list = vi.fn()
vi.mock('@/services/liveAgents', () => ({ liveAgentsApi: { list: (s?: AbortSignal) => list(s) } }))
let busHandler: ((e: unknown) => void) | undefined
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (h?: (e: unknown) => void) => {
    busHandler = h
  },
}))

import { LiveAgents } from '../LiveAgents'
import { LIVE_TEXT, STATE_LABEL, originLabel } from '../text'
import { LIVE_AGENTS_POLL_MS } from '@/hooks/useLiveAgents'

const agent = (over: Partial<LiveAgent> = {}): LiveAgent => ({
  session_id: 's1',
  title: 'Fix the bug',
  preview: null,
  project_slug: 'po',
  workspace_slug: null,
  model: 'claude-opus',
  cwd: '/tmp',
  origin: 'user',
  run_id: null,
  plan_id: null,
  task_id: null,
  state: 'streaming',
  pending_requests: 0,
  started_at: '2026-10-03T10:00:00Z',
  updated_at: '2026-10-03T10:05:00Z',
  age_secs: 300,
  idle_secs: 5,
  message_count: 4,
  total_cost_usd: 0.5,
  ...over,
})

const response = (agents: LiveAgent[]): LiveAgentsResponse => ({
  generated_at: '2026-10-03T10:05:05Z',
  agents,
  total: agents.length,
  waiting_input: agents.filter((a) => a.state === 'waiting_input').length,
  streaming: agents.filter((a) => a.state === 'streaming').length,
  idle: agents.filter((a) => a.state === 'idle').length,
})

const renderLive = () => {
  const store = createStore()
  const utils = render(
    <Provider store={store}>
      <LiveAgents />
    </Provider>,
  )
  return { store, ...utils }
}

beforeEach(() => {
  list.mockReset()
  busHandler = undefined
})
afterEach(() => vi.useRealTimers())

describe('LiveAgents', () => {
  it('lists the agents that wait or work, one line each: who waits first, with state, origin and duration', async () => {
    list.mockResolvedValue(
      response([
        agent({ session_id: 'b', title: 'Runs', origin: 'runner', state: 'streaming', age_secs: 300 }),
        agent({ session_id: 'c', title: 'Rests', state: 'idle', idle_secs: 120 }),
        agent({ session_id: 'a', title: 'Waits', state: 'waiting_input', pending_requests: 2, age_secs: 45 }),
      ]),
    )
    renderLive()
    expect(await screen.findByText('Waits')).toBeTruthy()
    expect(screen.getByRole('region', { name: LIVE_TEXT.region })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: LIVE_TEXT.title })).toBeTruthy()
    const rows = screen.getAllByTestId('live-agent')
    // Who needs the user first, then who works; the idle one is folded.
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['waiting_input', 'streaming'])
    expect(rows[0].textContent).toContain(`${STATE_LABEL.waiting_input} (2)`)
    expect(rows[0].textContent).toContain(originLabel('user'))
    expect(rows[0].textContent).toContain('45s')
    expect(rows[1].textContent).toContain(STATE_LABEL.streaming)
    expect(rows[1].textContent).toContain(originLabel('runner'))
    expect(rows[1].textContent).toContain('5m')
    // The whole line is ONE button; project, model, messages and cost are its tooltip, not text of the row.
    for (const r of rows) expect(r.querySelectorAll('button')).toHaveLength(1)
    const button = screen.getByRole('button', { name: `${LIVE_TEXT.open} Waits` })
    expect(rows[0].contains(button)).toBe(true)
    for (const fact of ['po', 'claude-opus', '4 msg', '$0.50']) expect(button.getAttribute('title')).toContain(fact)
    expect(rows[0].textContent).not.toContain('$0.50')
    expect(rows[0].textContent).not.toContain('claude-opus')
    // The summary counts who waits and who works: no total, no idle.
    expect(screen.getByText('1 attend ta réponse · 1 travaille')).toBeTruthy()
  })

  it('folds the idle agents behind a button that reveals them', async () => {
    list.mockResolvedValue(
      response([
        agent({ session_id: 'b', title: 'Runs', state: 'streaming' }),
        agent({ session_id: 'c', title: 'Rests', state: 'idle', age_secs: 4000, idle_secs: 120 }),
        agent({ session_id: 'd', title: 'Sleeps', state: 'idle', idle_secs: 30 }),
      ]),
    )
    const { store } = renderLive()
    expect(await screen.findByText('Runs')).toBeTruthy()
    const fold = screen.getByRole('button', { name: LIVE_TEXT.idle(2) })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Rests')).toBeNull()
    expect(screen.getAllByTestId('live-agent')).toHaveLength(1)

    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    const rows = screen.getAllByTestId('live-agent')
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['streaming', 'idle', 'idle'])
    // An idle agent says since when it is idle, not its age.
    expect(rows[1].textContent).toContain('Rests')
    expect(rows[1].textContent).toContain(STATE_LABEL.idle)
    expect(rows[1].textContent).toContain('2m')
    expect(rows[1].textContent).not.toContain('1h')
    // An idle agent opens like any other.
    fireEvent.click(screen.getByRole('button', { name: `${LIVE_TEXT.open} Sleeps` }))
    expect(store.get(chatSessionIdAtom)).toBe('d')
    expect(store.get(chatPanelModeAtom)).toBe('open')

    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Rests')).toBeNull()
  })

  it('shows only the fold when every agent is idle', async () => {
    list.mockResolvedValue(response([agent({ title: 'Rests', state: 'idle' })]))
    renderLive()
    const fold = await screen.findByRole('button', { name: LIVE_TEXT.idle(1) })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryAllByTestId('live-agent')).toHaveLength(0)
    // Not "nobody runs": one does, it is just idle.
    expect(screen.queryByText(LIVE_TEXT.empty)).toBeNull()
    fireEvent.click(fold)
    expect(screen.getByRole('button', { name: `${LIVE_TEXT.open} Rests` })).toBeTruthy()
  })

  it('says plainly that nobody runs', async () => {
    list.mockResolvedValue(response([]))
    renderLive()
    expect(await screen.findByText(LIVE_TEXT.empty, { selector: 'p.text-sm' })).toBeTruthy()
    expect(screen.queryAllByTestId('live-agent')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /inactif/ })).toBeNull()
  })

  it('opens the session in the chat panel on "Ouvrir"', async () => {
    list.mockResolvedValue(response([agent({ session_id: 'sess-42', title: 'Open me' })]))
    const { store } = renderLive()
    fireEvent.click(await screen.findByRole('button', { name: `${LIVE_TEXT.open} Open me` }))
    expect(store.get(chatSessionIdAtom)).toBe('sess-42')
    expect(store.get(chatPanelModeAtom)).toBe('open')
  })

  it('shows an error with a retry when the first load fails, never an empty list', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    renderLive()
    expect(await screen.findByText(LIVE_TEXT.loadError)).toBeTruthy()
    expect(screen.queryByText(LIVE_TEXT.empty)).toBeNull()
    list.mockResolvedValue(response([agent({ title: 'Back' })]))
    fireEvent.click(screen.getByRole('button', { name: /retry|réessayer|try again/i }))
    expect(await screen.findByText('Back')).toBeTruthy()
  })

  it('keeps the previous list and flags it stale when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    list.mockResolvedValueOnce(response([agent({ title: 'Still here' })]))
    renderLive()
    expect(await screen.findByText('Still here')).toBeTruthy()
    list.mockRejectedValue(new Error('down'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_AGENTS_POLL_MS + 10)
    })
    expect(screen.getByText('Still here')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('périmée')
  })

  it('re-reads on the timer and on attention_changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    list.mockResolvedValue(response([agent()]))
    renderLive()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_AGENTS_POLL_MS + 10)
    })
    expect(list).toHaveBeenCalledTimes(2)
    await act(async () => {
      busHandler?.({ type: 'attention_changed' })
    })
    expect(list).toHaveBeenCalledTimes(3)
    await act(async () => {
      busHandler?.({ type: 'something_else', entity_type: 'plan' })
    })
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('does not poll while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    list.mockResolvedValue(response([agent()]))
    renderLive()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_AGENTS_POLL_MS * 3)
    })
    expect(list).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(list).toHaveBeenCalledTimes(2)
  })
})
