/**
 * "Conversations anchored here": ONE request per page of results (never one per
 * row), the next page by cursor, live, and a clear line on a server without the routes.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrudEvent } from '@/types'

const anchors = vi.hoisted(() => ({ listAnchoredSessions: vi.fn() }))
vi.mock('@/services/anchors', async (orig) => ({ ...(await orig<typeof import('@/services/anchors')>()), anchorsApi: anchors }))
const bus = vi.hoisted(() => ({ handlers: [] as ((e: CrudEvent) => void)[] }))
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (fn?: (e: CrudEvent) => void) => {
    if (fn && !bus.handlers.includes(fn)) bus.handlers.push(fn)
  },
}))

import { chatPanelModeAtom, chatSessionIdAtom } from '@/atoms'
import { AnchorsUnavailableError } from '@/services/anchors'
import { AnchoredConversations } from '../AnchoredConversations'

const PLAN = '22222222-2222-4222-8222-222222222222'
const item = (n: number, over: Record<string, unknown> = {}) => ({
  session: { id: `s${n}`, title: `Talk ${n}`, updated_at: '2026-10-01T10:00:00Z', ...over },
  anchor: { id: `a${n}`, session_id: `s${n}`, target_type: 'plan', target_id: PLAN, roles: ['focus'], state: n === 2 ? 'moved' : 'live', by: 'user', version: 1 },
})

function renderPanel() {
  const store = createStore()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AnchoredConversations targetType="plan" targetId={PLAN} />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  bus.handlers = []
})

describe('AnchoredConversations', () => {
  it('reads one page in ONE request and lists each conversation with its role and state in words', async () => {
    anchors.listAnchoredSessions.mockResolvedValue({ items: [item(1), item(2, { activity: { streaming: true } }), item(3, { title: '' })] })
    renderPanel()
    expect(await screen.findByText('Talk 1')).toBeTruthy()
    expect(anchors.listAnchoredSessions).toHaveBeenCalledTimes(1)
    expect(anchors.listAnchoredSessions).toHaveBeenCalledWith({ target_type: 'plan', target_id: PLAN, limit: 20 })
    expect(screen.getByText('Moved')).toBeTruthy()
    expect(screen.getAllByText('Up to date')).toHaveLength(2)
    expect(screen.getAllByText('Focus')).toHaveLength(3)
    expect(screen.getByText('Untitled conversation')).toBeTruthy()
    expect(screen.getAllByText('Running now').length).toBeGreaterThan(0)
    // Complete list: the section counts it.
    expect(screen.getByRole('heading', { name: /Conversations anchored here\s*3/ })).toBeTruthy()
  })

  it('a row opens its conversation in the chat panel', async () => {
    anchors.listAnchoredSessions.mockResolvedValue({ items: [item(1)] })
    const store = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Talk 1' }))
    expect(store.get(chatSessionIdAtom)).toBe('s1')
    expect(store.get(chatPanelModeAtom)).toBe('open')
  })

  it('the next page is asked by cursor, on demand, without duplicates', async () => {
    anchors.listAnchoredSessions
      .mockResolvedValueOnce({ items: [item(1)], next_cursor: 'c1' })
      .mockResolvedValueOnce({ items: [item(1), item(2)] })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    expect(await screen.findByText('Talk 2')).toBeTruthy()
    expect(anchors.listAnchoredSessions).toHaveBeenLastCalledWith({ target_type: 'plan', target_id: PLAN, limit: 20, cursor: 'c1' })
    expect(screen.getAllByTestId('anchored-row')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('says it plainly when the server has no anchors routes — no error, no crash', async () => {
    anchors.listAnchoredSessions.mockRejectedValue(new AnchorsUnavailableError())
    renderPanel()
    expect(await screen.findByTestId('anchored-unavailable')).toBeTruthy()
    expect(screen.getByText('Anchored conversations are not available on this server.', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an empty list says how to anchor one; an error offers to try again', async () => {
    anchors.listAnchoredSessions.mockResolvedValueOnce({ items: [] })
    renderPanel()
    expect(await screen.findByText('No conversation is anchored here yet.')).toBeTruthy()
    expect(screen.getByText(/to ask a question anchored on it/)).toBeTruthy()
  })

  it('an error offers to try again', async () => {
    anchors.listAnchoredSessions.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ items: [item(1)] })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Talk 1')).toBeTruthy()
  })

  it('follows the events bus: an anchor change on THIS entity reads the first page again', async () => {
    anchors.listAnchoredSessions.mockResolvedValueOnce({ items: [item(1)] }).mockResolvedValue({ items: [item(1), item(2)] })
    renderPanel()
    await screen.findByText('Talk 1')
    const emit = (payload: Record<string, unknown>, entity_type = 'chat_session') =>
      act(() => bus.handlers.forEach((h) => h({ entity_type, action: 'updated', entity_id: 'sX', payload, timestamp: '' } as CrudEvent)))
    emit({ anchors: { target_type: 'plan', target_id: 'another' } })
    emit({ anchors: { target_type: 'plan', target_id: PLAN } }, 'plan')
    expect(anchors.listAnchoredSessions).toHaveBeenCalledTimes(1)
    emit({ anchors: { target_type: 'plan', target_id: PLAN, change: 'added' } })
    await waitFor(() => expect(screen.getByText('Talk 2')).toBeTruthy())
  })
})
