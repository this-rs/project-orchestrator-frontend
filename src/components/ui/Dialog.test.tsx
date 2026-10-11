/**
 * The shared Dialog is modal (useModalFocus): Tab stays inside, the page behind is
 * inert + aria-hidden while it is open, Escape closes it and focus goes back to its trigger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Dialog } from './Dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Rename">
        <input aria-label="Name" />
        <button type="button">Save</button>
      </Dialog>
    </>
  )
}

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })

function open() {
  const trigger = screen.getByRole('button', { name: 'Open dialog' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

describe('<Dialog> focus', () => {
  // Reduced motion: no exit animation to wait for.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.style.overflow = ''
  })

  it('Tab from the last control goes to the first (the close button), Shift+Tab from the first to the last', () => {
    render(<Harness />)
    open()
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(document.activeElement).toBe(close)
    save.focus()
    tab()
    expect(document.activeElement).toBe(close)
    tab(true)
    expect(document.activeElement).toBe(save)
  })

  it('Escape closes it and focus goes back to the trigger', async () => {
    render(<Harness />)
    const trigger = open()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('the page behind is inert and hidden while open, and given back on close', async () => {
    const { container } = render(<Harness />)
    open()
    expect(container.hasAttribute('inert')).toBe(true)
    expect(container.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(container.hasAttribute('inert')).toBe(false)
    expect(container.getAttribute('aria-hidden')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
