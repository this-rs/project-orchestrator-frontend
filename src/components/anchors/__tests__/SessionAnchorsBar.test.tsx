/**
 * The anchors of the conversation on screen: role and state in words, a link to
 * the entity, actions with If-Match, a 409 that shows the current set and says
 * so, live updates, and nothing at all on a server without the routes.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrudEvent } from '@/types'

const anchors = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), setRole: vi.fn(), remove: vi.fn(), listAnchoredSessions: vi.fn() }))
vi.mock('@/services/anchors', async (orig) => ({ ...(await orig<typeof import('@/services/anchors')>()), anchorsApi: anchors }))
const bus = vi.hoisted(() => ({ handlers: [] as ((e: CrudEvent) => void)[] }))
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (fn?: (e: CrudEvent) => void) => {
    if (fn && !bus.handlers.includes(fn)) bus.handlers.push(fn)
  },
}))

import { AnchorConflictError, AnchorRefusedError, AnchorsUnavailableError, type Anchor } from '@/services/anchors'
import { SessionAnchorsBar } from '../SessionAnchorsBar'

const SID = 's1'
const PLAN = '22222222-2222-4222-8222-222222222222'
const NOTE = '33333333-3333-4333-8333-333333333333'
const mk = (over: Partial<Anchor>): Anchor => ({
  id: 'a1',
  session_id: SID,
  target_type: 'plan',
  target_id: PLAN,
  roles: ['focus'],
  state: 'live',
  by: 'user',
  version: 1,
  snapshot_name: 'Auth flow',
  ...over,
})
const focus = mk({})
const mention = mk({ id: 'a2', target_type: 'note', target_id: NOTE, roles: ['mention'], state: 'dangling', by: 'agent', snapshot_name: 'Old note' })
const origin = mk({ id: 'a3', target_type: 'project', target_id: 'p1', roles: ['origin'], snapshot_name: 'Demo' })

function renderBar(sessionId: string | null = SID) {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/chat']}>
      <Routes>
        <Route path="/workspace/:slug/*" element={<SessionAnchorsBar sessionId={sessionId} />} />
      </Routes>
    </MemoryRouter>,
  )
}
const emit = (e: Partial<CrudEvent>) =>
  act(() => bus.handlers.forEach((h) => h({ entity_type: 'chat_session', action: 'updated', entity_id: SID, payload: {}, timestamp: '', ...e } as CrudEvent)))
const openList = () => fireEvent.click(screen.getByRole('button', { name: /Context anchors/ }))
const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))

beforeEach(() => {
  vi.clearAllMocks()
  bus.handlers = []
})

describe('SessionAnchorsBar', () => {
  it('folded to one line, then each anchor: a link to its entity, its role and its state in words', async () => {
    anchors.list.mockResolvedValue({ version: 3, anchors: [mention, focus, origin] })
    renderBar()
    const toggle = await screen.findByRole('button', { name: /Context anchors/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Anchors: 3')).toBeTruthy()
    openList()
    const rows = screen.getAllByTestId('session-anchor')
    // origin first, then focus, then mention
    expect(rows.map((r) => r.getAttribute('data-anchor-id'))).toEqual(['a3', 'a1', 'a2'])
    expect(screen.getByRole('link', { name: /Auth flow/ }).getAttribute('href')).toBe(`/workspace/ws/plans/${PLAN}`)
    // A deleted target is not a link, and says so in words (never by colour alone).
    expect(screen.queryByRole('link', { name: /Old note/ })).toBeNull()
    expect(screen.getByText('Target deleted')).toBeTruthy()
    expect(screen.getAllByText('Up to date')).toHaveLength(2)
    expect(screen.getByText('Placed by an assistant', { exact: false })).toBeTruthy()
    // The origin is fixed: no menu.
    expect(screen.getByText('The origin of a conversation cannot be changed.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Actions for Demo' })).toBeNull()
  })

  it('shows nothing on a server without the anchors routes, nor without anchors', async () => {
    anchors.list.mockRejectedValue(new AnchorsUnavailableError())
    const { container, unmount } = renderBar()
    await waitFor(() => expect(anchors.list).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    unmount()
    anchors.list.mockResolvedValue({ version: 0, anchors: [] })
    const second = renderBar()
    await waitFor(() => expect(anchors.list).toHaveBeenCalledTimes(2))
    expect(second.container.textContent).toBe('')
    second.unmount()
    expect(renderBar(null).container.textContent).toBe('')
  })

  it('removes with If-Match = the version read, announces it, and reads the set again', async () => {
    anchors.list.mockResolvedValueOnce({ version: 3, anchors: [focus, mention] }).mockResolvedValue({ version: 4, anchors: [mention] })
    anchors.remove.mockResolvedValue({ anchor: focus, created: false, changed: true, version: 4 })
    renderBar()
    await screen.findByRole('button', { name: /Context anchors/ })
    openList()
    openMenu('Auth flow')
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove the anchor/ }))
    await waitFor(() => expect(anchors.remove).toHaveBeenCalledWith(SID, 'a1', 3))
    expect(await screen.findByText('Auth flow is no longer anchored.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('link', { name: /Auth flow/ })).toBeNull())
  })

  it('a 409 shows the CURRENT anchors and says nothing was overwritten — the change is not re-sent', async () => {
    anchors.list.mockResolvedValue({ version: 3, anchors: [focus] })
    const theirs = mk({ id: 'a9', snapshot_name: 'Their plan', roles: ['mention'] })
    anchors.remove.mockRejectedValue(new AnchorConflictError({ version: 5, anchors: [focus, theirs] }))
    renderBar()
    await screen.findByRole('button', { name: /Context anchors/ })
    openList()
    openMenu('Auth flow')
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove the anchor/ }))
    const notice = await screen.findByTestId('anchors-notice')
    await waitFor(() => expect(notice.textContent).toMatch(/changed elsewhere.*nothing was overwritten/))
    expect(notice.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByRole('link', { name: /Their plan/ })).toBeTruthy()
    expect(anchors.remove).toHaveBeenCalledTimes(1)
  })

  it('a focus becomes a mention in two steps (never left without a role), each with the version before it', async () => {
    anchors.list.mockResolvedValue({ version: 3, anchors: [focus] })
    anchors.setRole
      .mockResolvedValueOnce({ anchor: mk({ roles: ['focus', 'mention'] }), created: false, changed: true, version: 4 })
      .mockResolvedValueOnce({ anchor: mk({ roles: ['mention'] }), created: false, changed: true, version: 5 })
    renderBar()
    await screen.findByRole('button', { name: /Context anchors/ })
    openList()
    openMenu('Auth flow')
    fireEvent.click(screen.getByRole('menuitem', { name: /Make it a mention/ }))
    await waitFor(() => expect(anchors.setRole).toHaveBeenCalledTimes(2))
    expect(anchors.setRole.mock.calls).toEqual([
      [SID, 'a1', 'promote', 'mention', 3],
      [SID, 'a1', 'demote', 'focus', 4],
    ])
    expect(await screen.findByText('Auth flow is now a mention.')).toBeTruthy()
  })

  it('promotes a mention to focus; a refusal is spoken in plain words', async () => {
    anchors.list.mockResolvedValue({ version: 2, anchors: [mk({ id: 'a5', roles: ['mention'] })] })
    anchors.setRole.mockRejectedValueOnce(new AnchorRefusedError(409, 'focus_cap_reached', 'cap'))
    renderBar()
    await screen.findByRole('button', { name: /Context anchors/ })
    openList()
    openMenu('Auth flow')
    fireEvent.click(screen.getByRole('menuitem', { name: /Make it a focus/ }))
    await waitFor(() => expect(anchors.setRole).toHaveBeenCalledWith(SID, 'a5', 'promote', 'focus', 2))
    expect(await screen.findByText(/at most 3 focus anchors/)).toBeTruthy()
  })

  it('follows the events bus: a newer version of this session is read again, an older one or another session is not', async () => {
    anchors.list.mockResolvedValueOnce({ version: 3, anchors: [focus] }).mockResolvedValue({ version: 4, anchors: [focus, mention] })
    renderBar()
    await screen.findByRole('button', { name: /Context anchors/ })
    emit({ payload: { anchors: { target_type: 'plan', target_id: PLAN, version: 3 } } })
    emit({ entity_id: 'other', payload: { anchors: { target_type: 'plan', target_id: PLAN, version: 9 } } })
    emit({ payload: { title: 'renamed' } })
    expect(anchors.list).toHaveBeenCalledTimes(1)
    emit({ payload: { anchors: { change: 'added', target_type: 'note', target_id: NOTE, version: 4 } } })
    await waitFor(() => expect(screen.getByText('Anchors: 2')).toBeTruthy())
  })

  it('a failed first read offers to try again', async () => {
    anchors.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ version: 1, anchors: [focus] })
    renderBar()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /Context anchors/ })).toBeTruthy()
  })
})
