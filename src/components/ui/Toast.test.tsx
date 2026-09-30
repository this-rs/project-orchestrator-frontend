import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { toastMessagesAtom } from '@/atoms'
import { ToastContainer } from './Toast'

function setup() {
  const store = createStore()
  render(
    <Provider store={store}>
      <ToastContainer />
    </Provider>,
  )
  const push = (id: string, message: string) =>
    act(() => store.set(toastMessagesAtom, (prev) => [...prev, { id, type: 'info', message }]))
  const toastOf = (message: string) => screen.getByText(message).closest('.rounded-xl') as HTMLElement
  return { push, toastOf }
}

describe('ToastContainer motion', () => {
  it('a second toast does not remount (replay the entrance of) the first one', () => {
    const { push, toastOf } = setup()
    push('a', 'First')
    const first = toastOf('First')
    expect(first).not.toBeNull()
    push('b', 'Second')
    expect(toastOf('First')).toBe(first)
  })

  it('the countdown bar animates transform, not width, inside its own toast', () => {
    const { push, toastOf } = setup()
    push('a', 'First')
    const toast = toastOf('First')
    // The bar is absolutely positioned: the toast must be its containing block.
    expect(toast.className).toMatch(/\brelative\b/)
    const bar = toast.querySelector('.ui-toast-countdown')
    expect(bar).not.toBeNull()
    expect(toast.innerHTML).not.toMatch(/shrinkWidth|slideInRight/)
  })
})
