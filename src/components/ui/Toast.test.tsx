import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toastMessagesAtom } from '@/atoms'
import { ToastContainer } from './Toast'

// vitest runs with css: false, so read the stylesheet as text.
const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

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

  it('the entrance is a transition from @starting-style, not a keyframe (interruptible)', () => {
    const { push, toastOf } = setup()
    push('a', 'First')
    expect(toastOf('First').className).toMatch(/\bui-toast-in\b/)
    const rule = indexCss.match(/\n\.ui-toast-in\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/transition:\s*opacity var\(--duration-fast\) var\(--ease-standard\)/)
    expect(rule?.[1]).toMatch(/transform var\(--duration-fast\) var\(--ease-standard\)/)
    expect(rule?.[1]).not.toMatch(/animation/)
    expect(indexCss).toMatch(/@starting-style\s*\{\s*\.ui-toast-in\s*\{[^}]*opacity:\s*0;[^}]*translateX\(100%\)/)
    expect(indexCss).not.toMatch(/@keyframes ui-toast-in/)
  })

  it('the countdown keyframe scales, it does not animate width', () => {
    const rule = indexCss.match(/@keyframes ui-toast-countdown\s*\{([^]*?)\n\}/)
    expect(rule?.[1]).toMatch(/scaleX\(1\)/)
    expect(rule?.[1]).toMatch(/scaleX\(0\)/)
    expect(rule?.[1]).not.toMatch(/width/)
    expect(indexCss).not.toMatch(/@keyframes shrinkWidth/)
  })
})
