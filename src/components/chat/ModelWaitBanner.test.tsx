/**
 * The composer says a provider did not answer and the harness is retrying, for how long.
 *
 * Run with: npx vitest run src/components/chat/ModelWaitBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatModelWaitAtom } from '@/atoms'
import { ModelWaitBanner } from './ModelWaitBanner'

const T0 = new Date('2026-11-03T10:00:00Z').getTime()
const MSG = 'The model did not answer (attempt 2 of 5): trying again in 2 s.'

function mount(sessionId: string | null = 'sess-1') {
  const store = createStore()
  const ui = render(
    <Provider store={store}>
      <ModelWaitBanner sessionId={sessionId} />
    </Provider>,
  )
  return { store, ...ui }
}

describe('ModelWaitBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  it('shows nothing without a wait', () => {
    mount()
    expect(screen.queryByTestId('model-wait-banner')).toBeNull()
  })

  it('shows the backend sentence and the elapsed time, which advances, then minutes + seconds', () => {
    const { store } = mount()
    act(() => store.set(chatModelWaitAtom, { sessionId: 'sess-1', message: MSG, since: T0 }))
    const banner = screen.getByTestId('model-wait-banner')
    expect(banner.textContent).toContain(MSG)
    expect(banner.textContent).toMatch(/0 s/)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(banner.textContent).toMatch(/5 s/)
    act(() => { vi.advanceTimersByTime(129_000) })
    expect(banner.textContent).toMatch(/2 min 14 s/)
  })

  it('disappears when the wait is cleared (model_recovered / result / interrupt)', () => {
    const { store } = mount()
    act(() => store.set(chatModelWaitAtom, { sessionId: 'sess-1', message: MSG, since: T0 }))
    expect(screen.getByTestId('model-wait-banner')).toBeTruthy()
    act(() => store.set(chatModelWaitAtom, null))
    expect(screen.queryByTestId('model-wait-banner')).toBeNull()
  })

  it('does not show another conversation\'s wait', () => {
    const { store } = mount('sess-2')
    act(() => store.set(chatModelWaitAtom, { sessionId: 'sess-1', message: MSG, since: T0 }))
    expect(screen.queryByTestId('model-wait-banner')).toBeNull()
  })
})
