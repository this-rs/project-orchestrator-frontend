/**
 * The composer says the vault holds the turn, for how long, and offers the unlock.
 *
 * Run with: npx vitest run src/components/chat/VaultWaitBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatVaultWaitAtom } from '@/atoms'
import { VaultWaitBanner } from './VaultWaitBanner'

vi.mock('./VaultUnlock', () => ({
  VaultUnlock: ({ onUnlocked }: { onUnlocked: () => void }) => (
    <button type="button" onClick={onUnlocked}>
      fake-unlock-form
    </button>
  ),
}))

const T0 = new Date('2026-11-03T10:00:00Z').getTime()

function mount(sessionId: string | null = 'sess-1', onUnlocked?: () => void) {
  const store = createStore()
  const ui = render(
    <Provider store={store}>
      <VaultWaitBanner sessionId={sessionId} onUnlocked={onUnlocked} />
    </Provider>,
  )
  return { store, ...ui }
}

describe('VaultWaitBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  it('shows nothing without a wait', () => {
    mount()
    expect(screen.queryByTestId('vault-wait-banner')).toBeNull()
  })

  it('appears with the elapsed time, which advances, then goes minutes + seconds', () => {
    const { store } = mount()
    act(() => store.set(chatVaultWaitAtom, { sessionId: 'sess-1', since: T0 }))
    expect(screen.getByTestId('vault-wait-banner').textContent).toMatch(/0 s/)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByTestId('vault-wait-banner').textContent).toMatch(/5 s/)
    act(() => { vi.advanceTimersByTime(129_000) })
    expect(screen.getByTestId('vault-wait-banner').textContent).toMatch(/2 min 14 s/)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('disappears when the wait is cleared (model_recovered / result / interrupt)', () => {
    const { store } = mount()
    act(() => store.set(chatVaultWaitAtom, { sessionId: 'sess-1', since: T0 }))
    expect(screen.getByTestId('vault-wait-banner')).toBeTruthy()
    act(() => store.set(chatVaultWaitAtom, null))
    expect(screen.queryByTestId('vault-wait-banner')).toBeNull()
  })

  it('does not show another conversation\'s wait', () => {
    const { store } = mount('sess-2')
    act(() => store.set(chatVaultWaitAtom, { sessionId: 'sess-1', since: T0 }))
    expect(screen.queryByTestId('vault-wait-banner')).toBeNull()
  })

  it('the button opens the unlock; once unlocked the wait is cleared and the caller told', () => {
    const onUnlocked = vi.fn()
    const { store } = mount('sess-1', onUnlocked)
    act(() => store.set(chatVaultWaitAtom, { sessionId: 'sess-1', since: T0 }))
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('fake-unlock-form'))
    expect(onUnlocked).toHaveBeenCalledTimes(1)
    expect(store.get(chatVaultWaitAtom)).toBeNull()
  })
})
