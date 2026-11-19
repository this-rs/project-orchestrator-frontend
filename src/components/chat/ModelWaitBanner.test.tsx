/**
 * The composer says a provider did not answer and the harness is retrying, for how long.
 *
 * Run with: npx vitest run src/components/chat/ModelWaitBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatModelWaitAtom } from '@/atoms'
import { createTranslator } from '@/i18n/translate'
import { loadLocale } from '@/i18n/store'
import { ModelWaitBanner } from './ModelWaitBanner'
import { modelWaitPhrase } from './modelWait'

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

  it('shows the translated sentence when the notice carried its counters', () => {
    const { store } = mount()
    act(() =>
      store.set(chatModelWaitAtom, {
        sessionId: 'sess-1',
        message: MSG,
        data: { attempt: 2, maxAttempts: 5, delayMs: 2000 },
        since: T0,
      }),
    )
    const banner = screen.getByTestId('model-wait-banner')
    expect(banner.textContent).toContain('attempt 2 of 5')
    expect(banner.textContent).toContain('2 s')
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

describe('modelWaitPhrase', () => {
  it('is translated when the locale is fr and the data is present', async () => {
    const t = createTranslator('fr', await loadLocale('fr')).t
    const phrase = modelWaitPhrase(t, {
      sessionId: 's',
      message: MSG,
      data: { attempt: 2, maxAttempts: 5, delayMs: 2000 },
      since: 0,
    })
    expect(phrase).toContain('essai 2 sur 5')
    expect(phrase).toContain('2 s')
  })

  it('falls back to the backend message when the data is missing', async () => {
    const t = createTranslator('fr', await loadLocale('fr')).t
    const phrase = modelWaitPhrase(t, { sessionId: 's', message: MSG, since: 0 })
    expect(phrase).toBe(MSG)
  })
})
