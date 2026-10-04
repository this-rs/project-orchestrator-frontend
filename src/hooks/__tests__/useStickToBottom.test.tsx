import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useStickToBottom } from '../useStickToBottom'

/** jsdom has no layout: give the scroller a geometry we control. */
function geometry(el: HTMLElement, g: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: g.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: g.clientHeight, configurable: true })
}

let onMount: ((el: HTMLDivElement) => void) | undefined

function Scroller({ messages }: { messages: string[] }) {
  const { scrollRef } = useStickToBottom<HTMLDivElement>(messages)
  return (
    <div
      data-testid="scroller"
      ref={(el) => {
        scrollRef.current = el
        if (el) onMount?.(el)
      }}
    >
      {messages.map((m) => <p key={m}>{m}</p>)}
    </div>
  )
}

describe('useStickToBottom', () => {
  it('opens a conversation at its end, even when the first batch is far taller than the view', () => {
    // Measuring "near the bottom" AFTER the batch landed would say no (2000 - 0 - 400) and never follow.
    onMount = (el) => geometry(el, { scrollHeight: 2000, clientHeight: 400 })
    const { getByTestId } = render(<Scroller messages={['a', 'b']} />)
    expect(getByTestId('scroller').scrollTop).toBe(2000)
  })

  it('follows new messages while the reader is at the bottom', () => {
    onMount = undefined
    const { getByTestId, rerender } = render(<Scroller messages={['a']} />)
    const el = getByTestId('scroller')
    geometry(el, { scrollHeight: 1000, clientHeight: 400 })
    el.scrollTop = 600
    fireEvent.scroll(el)

    geometry(el, { scrollHeight: 1300, clientHeight: 400 })
    rerender(<Scroller messages={['a', 'b']} />)
    expect(el.scrollTop).toBe(1300)
  })

  it('leaves a reader who scrolled up where they are when a message arrives', () => {
    onMount = undefined
    const { getByTestId, rerender } = render(<Scroller messages={['a']} />)
    const el = getByTestId('scroller')
    geometry(el, { scrollHeight: 1000, clientHeight: 400 })
    el.scrollTop = 100 // reading older messages
    fireEvent.scroll(el)

    geometry(el, { scrollHeight: 1300, clientHeight: 400 })
    rerender(<Scroller messages={['a', 'b']} />)
    expect(el.scrollTop).toBe(100)

    // Back at the bottom: following resumes.
    el.scrollTop = 900
    fireEvent.scroll(el)
    geometry(el, { scrollHeight: 1600, clientHeight: 400 })
    rerender(<Scroller messages={['a', 'b', 'c']} />)
    expect(el.scrollTop).toBe(1600)
  })
})
