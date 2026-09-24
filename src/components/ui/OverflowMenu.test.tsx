import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Pencil } from 'lucide-react'
import { OverflowMenu } from './OverflowMenu'

// ConfirmDialog → useReducedMotion → matchMedia (absent in jsdom)
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

describe('OverflowMenu', () => {
  it('opens a menu in a portal with fixed JS positioning (no CSS anchor)', () => {
    render(<OverflowMenu actions={[{ label: 'Edit', onClick: () => {} }]} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    expect(menu.parentElement).toBe(document.body)
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).not.toBe('')
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)
  })

  it('runs the action and closes', () => {
    const onEdit = vi.fn()
    render(<OverflowMenu actions={[{ label: 'Edit', onClick: onEdit, icon: Pencil }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('focuses the first item and supports arrow keys + Escape', () => {
    render(
      <OverflowMenu
        actions={[
          { label: 'One', onClick: () => {} },
          { label: 'Disabled', onClick: () => {}, disabled: true },
          { label: 'Two', onClick: () => {} },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    const one = screen.getByRole('menuitem', { name: 'One' })
    const two = screen.getByRole('menuitem', { name: 'Two' })
    expect(document.activeElement).toBe(one)
    fireEvent.keyDown(one, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(two) // disabled item skipped
    fireEvent.keyDown(two, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(one) // wraps
    fireEvent.keyDown(one, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on outside pointerdown', () => {
    render(
      <div>
        <span>outside</span>
        <OverflowMenu actions={[{ label: 'Edit', onClick: () => {} }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('does not bubble clicks to a parent handler', () => {
    const parent = vi.fn()
    render(
      <div onClick={parent}>
        <OverflowMenu actions={[{ label: 'Edit', onClick: () => {} }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(parent).not.toHaveBeenCalled()
  })

  it('hides hidden actions and renders nothing when all are hidden', () => {
    const { container, rerender } = render(
      <OverflowMenu actions={[{ label: 'A', onClick: () => {} }, { label: 'B', onClick: () => {}, hidden: true }]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: 'B' })).toBeNull()
    rerender(<OverflowMenu actions={[{ label: 'B', onClick: () => {}, hidden: true }]} />)
    expect(container.innerHTML).toBe('')
  })

  it('asks for confirmation before a destructive action', async () => {
    const onDelete = vi.fn()
    render(
      <OverflowMenu
        label="Actions for X"
        actions={[
          {
            label: 'Delete',
            variant: 'danger',
            onClick: onDelete,
            confirm: { title: 'Delete X?', description: 'Cannot be undone.' },
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Actions for X' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete X?')).toBeTruthy()
    const confirmBtn = screen.getAllByRole('button', { name: 'Delete' }).at(-1)!
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
  })
})
