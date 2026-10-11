/**
 * The file history sheet is modal (useModalFocus): focus moves in, Tab stays inside,
 * the page behind is inert + aria-hidden while it is open, Escape closes it and focus
 * goes back to what opened it.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

vi.mock('@/services', () => ({
  commitsApi: {
    getFileHistory: vi.fn().mockResolvedValue({ items: [] }),
    getFileCoChangers: vi.fn().mockResolvedValue({ items: [] }),
  },
}))

import { FileHistoryDrawer } from './FileHistoryDrawer'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>History</button>
      {open && (
        <FileHistoryDrawer filePath="src/a.ts" projectSlug="p" onClose={() => setOpen(false)} onNavigate={() => {}} />
      )}
    </>
  )
}

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey })

async function open() {
  const trigger = screen.getByRole('button', { name: 'History' })
  trigger.focus()
  fireEvent.click(trigger)
  // Loaded: the last control (the co-change graph toggle) is there.
  const graph = await screen.findByRole('button', { name: 'Co-change graph' })
  return { trigger, close: screen.getByRole('button', { name: 'Close file history' }), graph }
}

describe('<FileHistoryDrawer> focus', () => {
  it('focus moves to the close button; Tab from the last control wraps to it, Shift+Tab from it to the last', async () => {
    render(<Harness />)
    const { close, graph } = await open()
    expect(document.activeElement).toBe(close)
    graph.focus()
    tab()
    expect(document.activeElement).toBe(close)
    tab(true)
    expect(document.activeElement).toBe(graph)
  })

  it('Escape closes it and focus goes back to the trigger', async () => {
    render(<Harness />)
    const { trigger, graph } = await open()
    graph.focus()
    fireEvent.keyDown(graph, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('the page behind is inert and hidden while open, and given back on close', async () => {
    const { container } = render(<Harness />)
    const { close } = await open()
    expect(container.hasAttribute('inert')).toBe(true)
    expect(container.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    fireEvent.click(close)
    expect(container.hasAttribute('inert')).toBe(false)
    expect(container.getAttribute('aria-hidden')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
