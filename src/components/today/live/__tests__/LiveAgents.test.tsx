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
  it('lists every running agent with its state, origin and facts', async () => {
    list.mockResolvedValue(
      response([
        agent({ session_id: 'a', title: 'Waits', state: 'waiting_input', pending_requests: 2 }),
        agent({ session_id: 'b', title: 'Runs', origin: 'runner', state: 'streaming' }),
        agent({ session_id: 'c', title: 'Rests', state: 'idle', idle_secs: 120 }),
      ]),
    )
    renderLive()
    expect(await screen.findByText('Waits')).toBeTruthy()
    const rows = screen.getAllByTestId('live-agent')
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['waiting_input', 'streaming', 'idle'])
    expect(rows[0].textContent).toContain('Attend ta réponse (2)')
    expect(rows[1].textContent).toContain('Plan')
    expect(rows[2].textContent).toContain('inactif depuis 2m')
    expect(rows[0].textContent).toContain('$0.50')
    expect(screen.getByText(/3 agents · 1 attend ta réponse · 1 travaille · 1 inactif/)).toBeTruthy()
  })

  it('says plainly that nobody runs', async () => {
    list.mockResolvedValue(response([]))
    renderLive()
    expect(await screen.findByText('Aucun agent ne tourne en ce moment', { selector: 'p.text-sm' })).toBeTruthy()
    expect(screen.queryAllByTestId('live-agent')).toHaveLength(0)
  })

  it('opens the session in the chat panel on "Ouvrir"', async () => {
    list.mockResolvedValue(response([agent({ session_id: 'sess-42', title: 'Open me' })]))
    const { store } = renderLive()
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Open me' }))
    expect(store.get(chatSessionIdAtom)).toBe('sess-42')
    expect(store.get(chatPanelModeAtom)).toBe('open')
  })

  it('shows an error with a retry when the first load fails, never an empty list', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    renderLive()
    expect(await screen.findByText('La liste des agents n’a pas pu être chargée.')).toBeTruthy()
    expect(screen.queryByText('Aucun agent ne tourne en ce moment', { selector: 'p.text-sm' })).toBeNull()
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
