/**
 * « Exécuter dans X ? » card (EXEC-CONFIRM).
 *
 * What matters:
 * - the event shows a card with the path the HARNESS announced (read-only);
 * - Autoriser sends that exact path to confirm, Refuser calls reject;
 * - a placement already seen is not duplicated;
 * - nothing shows in a child / agent session;
 * - a 403/409/410 is shown, not swallowed.
 *
 * Run with: npx vitest run src/components/chat/ExecPlaceConfirmTray.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ExecPlaceConfirmTray } from './ExecPlaceConfirmTray'
import { execConfirmFromEvent } from '@/utils/executionPlace'
import { ApiError } from '@/services/api'
import { execConfirmRequestsAtom } from '@/atoms'
import { currentUserAtom } from '@/atoms/auth'
import type { CrudEvent, AuthUser } from '@/types'

let emit: (e: CrudEvent) => void = () => {}
vi.mock('@/hooks/useEventBus', async () => {
  const React = await import('react')
  return {
    useEventBus: (cb: (e: CrudEvent) => void) => {
      React.useEffect(() => {
        emit = cb
      }, [cb])
    },
  }
})

const get = vi.fn()
const confirm = vi.fn()
const reject = vi.fn()
const listPending = vi.fn()
vi.mock('@/services/executionPlace', () => ({
  executionPlaceApi: { get: (...a: unknown[]) => get(...a), confirm: (...a: unknown[]) => confirm(...a), reject: (...a: unknown[]) => reject(...a), listPending: (...a: unknown[]) => listPending(...a) },
}))

const PATH = '/tmp/po-worktrees/task-1'
const event = (over: Record<string, unknown> = {}): CrudEvent => ({
  entity_type: 'task',
  action: 'updated',
  entity_id: 'task-1',
  timestamp: '2026-10-25T00:00:00Z',
  payload: { event: 'execution_place_confirmation_required', placement_id: 'pl-1', task_id: 'task-1', plan_id: 'plan-1', path: PATH, owner: 'me', requested_by: 'session:s', ...over },
})

const ME: AuthUser = { id: 'me', email: 'me@example.org', name: 'Me' }

function mount(humanSession = true, user: AuthUser | null = ME) {
  const store = createStore()
  if (user) store.set(currentUserAtom, user)
  render(
    <Provider store={store}>
      <ExecPlaceConfirmTray humanSession={humanSession} />
    </Provider>,
  )
  return store
}

beforeEach(() => {
  get.mockReset().mockResolvedValue({ placement_id: 'pl-1', path: PATH, expires_at: '2099-01-01T00:00:00Z' })
  confirm.mockReset().mockResolvedValue({})
  reject.mockReset().mockResolvedValue({})
  listPending.mockReset().mockResolvedValue([])
})

describe('ExecPlaceConfirmTray', () => {
  it('shows the announced path when the event arrives', async () => {
    mount()
    act(() => emit(event()))
    expect((await screen.findByTestId('exec-confirm-path')).textContent).toBe(PATH)
  })

  it('Allow confirms with the exact path', async () => {
    mount()
    act(() => emit(event()))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('pl-1', PATH))
    expect(await screen.findByText(/Confirmed/)).toBeTruthy()
  })

  it('Refuse rejects', async () => {
    mount()
    act(() => emit(event()))
    fireEvent.click(await screen.findByRole('button', { name: 'Refuse' }))
    await waitFor(() => expect(reject).toHaveBeenCalledWith('pl-1'))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('does not duplicate a placement already seen', async () => {
    const store = mount()
    act(() => emit(event()))
    act(() => emit(event()))
    await screen.findByTestId('exec-confirm-path')
    expect(screen.getAllByTestId('exec-confirm-path')).toHaveLength(1)
    expect(store.get(execConfirmRequestsAtom)).toHaveLength(1)
  })

  it('shows nothing in a child / agent session', () => {
    mount(false)
    act(() => emit(event()))
    expect(screen.queryByTestId('exec-confirm-path')).toBeNull()
  })

  it('shows a refusal readably instead of swallowing it', async () => {
    confirm.mockRejectedValue(new ApiError(403, 'forbidden'))
    mount()
    act(() => emit(event()))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Only the owner/)
  })

  it('reads 410 as expired', async () => {
    confirm.mockRejectedValue(new ApiError(410, 'gone'))
    mount()
    act(() => emit(event()))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(await screen.findByText(/Expired/)).toBeTruthy()
  })

  it('reads a passed expires_at as expired and offers no answer', async () => {
    get.mockResolvedValue({ placement_id: 'pl-1', path: PATH, expires_at: '2000-01-01T00:00:00Z' })
    mount()
    act(() => emit(event()))
    expect(await screen.findByText(/Expired/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })

  it('ignores an announcement without a path or from another event', () => {
    expect(execConfirmFromEvent(event({ path: '' }))).toBeNull()
    expect(execConfirmFromEvent(event({ event: 'something_else' }))).toBeNull()
    expect(execConfirmFromEvent({ ...event(), entity_type: 'plan' })).toBeNull()
  })

  // ── Re-hydration after page reload (EXEC-CONFIRM-suite) ─────────────

  it('re-hydrates pending placements on mount from the listing route', async () => {
    listPending.mockResolvedValue([
      { placement_id: 'pl-2', path: '/wt/task-2', owner: 'me', task_id: 't-2', expires_at: '2099-01-01T00:00:00Z' },
    ])
    const store = mount()
    // The listPending call is fired on mount; wait for the atom to be populated.
    await waitFor(() => expect(store.get(execConfirmRequestsAtom)).toHaveLength(1))
    const reqs = store.get(execConfirmRequestsAtom)
    expect(reqs[0].placementId).toBe('pl-2')
    expect(reqs[0].path).toBe('/wt/task-2')
    expect(reqs[0].state).toBe('pending')
    expect(reqs[0].expiresAt).toBe('2099-01-01T00:00:00Z')
    expect(listPending).toHaveBeenCalledTimes(1)
  })

  it('deduplicates re-hydrated placements with those already from events', async () => {
    listPending.mockResolvedValue([
      { placement_id: 'pl-1', path: PATH, owner: 'me', task_id: 't-1', expires_at: '2099-01-01T00:00:00Z' },
    ])
    const store = mount()
    // An event arrives for the same placement.
    act(() => emit(event()))
    await waitFor(() => expect(store.get(execConfirmRequestsAtom).length).toBeGreaterThanOrEqual(1))
    // Should have exactly one, not two.
    expect(store.get(execConfirmRequestsAtom)).toHaveLength(1)
  })

  it('filters out placements whose owner differs from the connected person', async () => {
    listPending.mockResolvedValue([
      { placement_id: 'pl-3', path: '/wt/task-3', owner: 'someone-else', task_id: 't-3', expires_at: '2099-01-01T00:00:00Z' },
      { placement_id: 'pl-4', path: '/wt/task-4', owner: 'me', task_id: 't-4', expires_at: '2099-01-01T00:00:00Z' },
    ])
    const store = mount()
    await waitFor(() => expect(store.get(execConfirmRequestsAtom)).toHaveLength(1))
    expect(store.get(execConfirmRequestsAtom)[0].placementId).toBe('pl-4')
  })

  it('filters CrudEvent by owner when the connected user is known', async () => {
    mount(true, ME)
    // An event for another person's placement.
    act(() => emit(event({ owner: 'someone-else' })))
    // Give it a tick to process.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('exec-confirm-path')).toBeNull()
    // An event for our own placement shows the card.
    act(() => emit(event({ owner: 'me' })))
    expect(await screen.findByTestId('exec-confirm-path')).toBeTruthy()
  })

  it('does not call listPending in a non-human session', async () => {
    mount(false)
    await new Promise((r) => setTimeout(r, 50))
    expect(listPending).not.toHaveBeenCalled()
  })
})
