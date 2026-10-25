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
import type { CrudEvent } from '@/types'

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
vi.mock('@/services/executionPlace', () => ({
  executionPlaceApi: { get: (...a: unknown[]) => get(...a), confirm: (...a: unknown[]) => confirm(...a), reject: (...a: unknown[]) => reject(...a) },
}))

const PATH = '/tmp/po-worktrees/task-1'
const event = (over: Record<string, unknown> = {}): CrudEvent => ({
  entity_type: 'task',
  action: 'updated',
  entity_id: 'task-1',
  timestamp: '2026-10-25T00:00:00Z',
  payload: { event: 'execution_place_confirmation_required', placement_id: 'pl-1', task_id: 'task-1', plan_id: 'plan-1', path: PATH, owner: 'me', requested_by: 'session:s', ...over },
})

function mount(humanSession = true) {
  const store = createStore()
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
})
