/**
 * The one focus trap of the modal views: Tab kept inside, focus in and back out,
 * the background inert + aria-hidden, nested views.
 * jsdom implements neither `inert` nor Tab moving focus: what is checked is what the hook does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { modalStackDepth, useModalFocus } from '../useModalFocus'

function Modal({ name, active = true, onEscape, children, portal = true }: { name: string; active?: boolean; onEscape?: () => void; children?: ReactNode; portal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus(ref, { active, onEscape })
  if (!active) return null
  const view = (
    <div ref={ref} role="dialog" aria-label={name} data-testid={name}>
      {children ?? (
        <>
          <button type="button">{`${name} first`}</button>
          <button type="button">{`${name} middle`}</button>
          <button type="button">{`${name} last`}</button>
        </>
      )}
    </div>
  )
  return portal ? createPortal(view, document.body) : view
}

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey })
const button = (name: string) => screen.getByRole('button', { name, hidden: true })

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useModalFocus: Tab stays inside', () => {
  it('Tab from the last element goes to the first, Shift+Tab from the first to the last', () => {
    render(<Modal name="A" />)
    button('A last').focus()
    tab()
    expect(document.activeElement).toBe(button('A first'))
    tab(true)
    expect(document.activeElement).toBe(button('A last'))
    // Between inner elements the move is the browser's: the keydown is not prevented.
    button('A middle').focus()
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(button('A middle'))
  })

  it('from the container itself, Shift+Tab goes to the last element', () => {
    render(<Modal name="A" />)
    screen.getByTestId('A').focus()
    tab(true)
    expect(document.activeElement).toBe(button('A last'))
  })

  it('with nothing tabbable inside, focus stays on the container', () => {
    render(<><button type="button">outside</button><Modal name="A"><p>Nothing to reach</p></Modal></>)
    const view = screen.getByTestId('A')
    expect(document.activeElement).toBe(view)
    expect(view.getAttribute('tabindex')).toBe('-1')
    tab()
    expect(document.activeElement).toBe(view)
    tab(true)
    expect(document.activeElement).toBe(view)
  })

  it('brings back a focus that escaped to the page (Tab goes to the first element)', () => {
    render(<Modal name="A" />)
    ;(document.activeElement as HTMLElement).blur()
    tab()
    expect(document.activeElement).toBe(button('A first'))
  })
})

describe('useModalFocus: focus in, focus back', () => {
  function Harness({ initial }: { initial?: boolean }) {
    const [open, setOpen] = useState(false)
    const initialRef = useRef<HTMLButtonElement>(null)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        {open && <Opened initial={initial ? initialRef : undefined} onClose={() => setOpen(false)} />}
      </>
    )
  }
  function Opened({ initial, onClose }: { initial?: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useModalFocus(ref, { initialFocus: initial, onEscape: onClose })
    return createPortal(
      <div ref={ref} role="dialog" aria-label="Opened">
        <button type="button">Inside first</button>
        <button type="button" ref={initial}>Close</button>
      </div>,
      document.body,
    )
  }

  it('moves focus to the first element, then back to the trigger on Escape', () => {
    render(<Harness />)
    const trigger = button('Open')
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(button('Inside first'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('moves focus to `initialFocus` when given', () => {
    render(<Harness initial />)
    const trigger = button('Open')
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(button('Close'))
  })
})

describe('useModalFocus: the background', () => {
  it('a portalled view: every other child of <body> is inert + aria-hidden, previous values come back', () => {
    const before = document.createElement('div')
    before.setAttribute('aria-hidden', 'false')
    const alreadyInert = document.createElement('div')
    alreadyInert.setAttribute('inert', '')
    const toasts = document.createElement('div')
    toasts.setAttribute('aria-live', 'polite')
    document.body.append(before, alreadyInert, toasts)
    const { container, rerender } = render(<Modal name="A" />)

    for (const el of [container, before, alreadyInert]) {
      expect(el.hasAttribute('inert')).toBe(true)
      expect(el.getAttribute('aria-hidden')).toBe('true')
    }
    // Live regions keep being announced.
    expect(toasts.hasAttribute('inert')).toBe(false)
    const view = screen.getByTestId('A')
    expect(view.hasAttribute('inert')).toBe(false)
    expect(view.getAttribute('aria-hidden')).toBeNull()

    rerender(<Modal name="A" active={false} />)
    expect(container.hasAttribute('inert')).toBe(false)
    expect(container.getAttribute('aria-hidden')).toBeNull()
    expect(before.hasAttribute('inert')).toBe(false)
    expect(before.getAttribute('aria-hidden')).toBe('false')
    expect(alreadyInert.hasAttribute('inert')).toBe(true)
    expect(alreadyInert.getAttribute('aria-hidden')).toBeNull()
  })

  it('a view rendered in place: the siblings of it and of each ancestor, not the ancestors', () => {
    const outsideRoot = document.createElement('aside')
    document.body.append(outsideRoot)
    const { container } = render(
      <main data-testid="main">
        <nav data-testid="nav"><button type="button">Nav</button></nav>
        <section data-testid="section">
          <header data-testid="header"><button type="button">Header</button></header>
          <Modal name="A" portal={false} />
        </section>
      </main>,
    )
    expect(screen.getByTestId('header').hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('nav').hasAttribute('inert')).toBe(true)
    expect(outsideRoot.hasAttribute('inert')).toBe(true)
    expect(outsideRoot.getAttribute('aria-hidden')).toBe('true')
    for (const id of ['section', 'main']) {
      expect(screen.getByTestId(id).hasAttribute('inert')).toBe(false)
      expect(screen.getByTestId(id).getAttribute('aria-hidden')).toBeNull()
    }
    expect(container.hasAttribute('inert')).toBe(false)
  })
})

describe('useModalFocus: nested views', () => {
  function Nested({ inner = true, outer = true }: { inner?: boolean; outer?: boolean }) {
    return (
      <>
        <button type="button">Page</button>
        <Modal name="Outer" active={outer} />
        <Modal name="Inner" active={inner} />
      </>
    )
  }

  it('only the topmost view hides its background; closing it gives the background back to the outer one', () => {
    const { container, rerender } = render(<Nested inner={false} />)
    const outer = screen.getByTestId('Outer')
    expect(container.hasAttribute('inert')).toBe(true)
    expect(outer.hasAttribute('inert')).toBe(false)

    rerender(<Nested />)
    const inner = screen.getByTestId('Inner')
    expect(outer.hasAttribute('inert')).toBe(true)
    expect(outer.getAttribute('aria-hidden')).toBe('true')
    expect(container.hasAttribute('inert')).toBe(true)
    expect(inner.hasAttribute('inert')).toBe(false)
    expect(modalStackDepth()).toBe(2)

    rerender(<Nested inner={false} />)
    // The outer view is usable again, the page behind it is still hidden.
    expect(outer.hasAttribute('inert')).toBe(false)
    expect(outer.getAttribute('aria-hidden')).toBeNull()
    expect(container.hasAttribute('inert')).toBe(true)
    expect(container.getAttribute('aria-hidden')).toBe('true')

    rerender(<Nested inner={false} outer={false} />)
    expect(container.hasAttribute('inert')).toBe(false)
    expect(container.getAttribute('aria-hidden')).toBeNull()
    expect(modalStackDepth()).toBe(0)
  })

  it('Tab and Escape belong to the topmost view only', () => {
    const onOuterEscape = vi.fn()
    const onInnerEscape = vi.fn()
    render(
      <>
        <Modal name="Outer" onEscape={onOuterEscape} />
        <Modal name="Inner" onEscape={onInnerEscape} />
      </>,
    )
    button('Inner last').focus()
    tab()
    expect(document.activeElement).toBe(button('Inner first'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onInnerEscape).toHaveBeenCalledTimes(1)
    expect(onOuterEscape).not.toHaveBeenCalled()
  })

  it('the outer view closing first leaves the inner one in charge, and everything comes back at the end', () => {
    const { container, rerender } = render(<Nested />)
    rerender(<Nested outer={false} />)
    const inner = screen.getByTestId('Inner')
    expect(inner.hasAttribute('inert')).toBe(false)
    expect(container.hasAttribute('inert')).toBe(true)
    act(() => rerender(<Nested outer={false} inner={false} />))
    expect(container.hasAttribute('inert')).toBe(false)
    expect(modalStackDepth()).toBe(0)
  })
})

describe('useModalFocus: live regions in the hidden part', () => {
  it('a live region nested in the background stays exposed; what is around it is hidden', () => {
    const app = document.createElement('div')
    app.innerHTML = '<header id="h"><button>Menu</button></header><div id="wrap"><p id="beside">x</p><div id="banner" role="status">Update ready</div></div>'
    document.body.append(app)
    const { rerender } = render(<Modal name="A" />)
    const byId = (id: string) => document.getElementById(id)!
    for (const el of [app, byId('wrap'), byId('banner')]) {
      expect(el.hasAttribute('inert')).toBe(false)
      expect(el.getAttribute('aria-hidden')).toBeNull()
    }
    for (const el of [byId('h'), byId('beside')]) {
      expect(el.hasAttribute('inert')).toBe(true)
      expect(el.getAttribute('aria-hidden')).toBe('true')
    }
    rerender(<Modal name="A" active={false} />)
    for (const el of [byId('h'), byId('beside')]) {
      expect(el.hasAttribute('inert')).toBe(false)
      expect(el.getAttribute('aria-hidden')).toBeNull()
    }
  })
})

describe('useModalFocus: a parent and a child opened in the same render', () => {
  function Harness({ onParentEscape, onChildEscape }: { onParentEscape: () => void; onChildEscape: () => void }) {
    const [open, setOpen] = useState(false)
    const [child, setChild] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open both</button>
        {open && (
          <Modal name="Parent" onEscape={() => { onParentEscape(); setOpen(false) }}>
            <button type="button">Parent first</button>
            {child && (
              <Modal name="Child" onEscape={() => { onChildEscape(); setChild(false) }} />
            )}
          </Modal>
        )}
      </>
    )
  }

  it('the child is on top: it holds focus, Escape and the background; closing it hands over to the parent', () => {
    const onParentEscape = vi.fn()
    const onChildEscape = vi.fn()
    render(<Harness onParentEscape={onParentEscape} onChildEscape={onChildEscape} />)
    const trigger = button('Open both')
    trigger.focus()
    fireEvent.click(trigger)
    const parent = screen.getByTestId('Parent')
    const child = screen.getByTestId('Child')
    expect(child.contains(document.activeElement)).toBe(true)
    expect(parent.hasAttribute('inert')).toBe(true)
    expect(child.hasAttribute('inert')).toBe(false)

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onChildEscape).toHaveBeenCalledTimes(1)
    expect(onParentEscape).not.toHaveBeenCalled()
    expect(screen.queryByTestId('Child')).toBeNull()
    // The trigger is still behind the parent: focus goes into the parent instead.
    expect(parent.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(button('Parent first'))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onParentEscape).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)
    expect(modalStackDepth()).toBe(0)
  })
})
