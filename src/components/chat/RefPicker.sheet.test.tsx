/**
 * The picker as a bottom sheet (narrow screens). jsdom computes no layout:
 * this checks classes, attributes and behaviour that can be measured without
 * one (touch-target classes, placement style, portal, close, focus), not pixels.
 *
 * Run with: npx vitest run src/components/chat/RefPicker.sheet.test.tsx
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RefSearchItem } from '@/refs/refsApi'
import { REF_KINDS } from '@/refs/types'
import { refKindDef } from '@/refs/registry'
import { RefPicker } from './RefPicker'

afterEach(cleanup)

const KINDS = REF_KINDS
const items: RefSearchItem[] = Array.from({ length: 12 }, (_, i) => ({
  kind: KINDS[i % KINDS.length],
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  label: `Item ${i}`,
}))

function sheet(over: Partial<React.ComponentProps<typeof RefPicker>> = {}) {
  const anchor = document.createElement('div')
  document.body.append(anchor)
  const props = {
    listId: 'L',
    search: { status: 'ready', items } as never,
    activeIndex: 0,
    full: false,
    onPick: vi.fn(),
    onHover: vi.fn(),
    sheet: true,
    anchor,
    onClose: vi.fn(),
    ...over,
  }
  render(<RefPicker {...props} />)
  return props
}

describe('RefPicker as a bottom sheet', () => {
  it('is marked as a sheet, fixed to the screen and rendered outside the composer (a backdrop-filter parent would capture position: fixed)', () => {
    sheet()
    const el = screen.getByTestId('ref-picker')
    expect(el.dataset.variant).toBe('sheet')
    expect(el.className).toMatch(/\bfixed\b/)
    expect(el.className).not.toMatch(/\babsolute\b/)
    expect(el.parentElement).toBe(document.body)
  })

  it('is a popover (absolute) when not a sheet', () => {
    sheet({ sheet: false })
    const el = screen.getByTestId('ref-picker')
    expect(el.dataset.variant).toBe('popover')
    expect(el.className).toMatch(/\babsolute\b/)
  })

  it('every row is at least 44px high whatever the pointer says, for every kind', () => {
    sheet()
    const rows = screen.getAllByTestId('ref-option')
    expect(rows).toHaveLength(items.length)
    for (const row of rows) expect(row.className).toMatch(/\bmin-h-11\b/)
    // Each row says what it is (the kind's name on its second line).
    rows.forEach((r, i) => expect(r.textContent).toContain(refKindDef(items[i].kind).name))
  })

  it('takes its height and its position from the visual viewport placement', () => {
    sheet()
    const el = screen.getByTestId('ref-picker')
    expect(el.style.maxHeight).toMatch(/px$/)
    expect(el.style.bottom).toMatch(/px$/)
  })

  it('has a close button of at least 44px that closes without taking the focus (mousedown prevented)', () => {
    const p = sheet()
    const close = screen.getByRole('button', { name: /close/i })
    expect(close.className).toMatch(/\bsize-11\b|\bmin-h-11\b/)
    expect(close.className).toMatch(/\bmin-w-11\b|\bsize-11\b/)
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    close.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    fireEvent.click(close)
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('has no close button as a popover (Escape and the pointer do the job)', () => {
    sheet({ sheet: false })
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
  })

  it('keeps the caret in the composer when a row is pressed, and picks on click', () => {
    const p = sheet()
    const row = screen.getAllByTestId('ref-option')[2]
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    row.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    fireEvent.click(row)
    expect(p.onPick).toHaveBeenCalledWith(items[2])
  })

  it('motion and contrast: the entrance is opt-in to motion, the sheet scrolls without chaining to the page', () => {
    sheet()
    const el = screen.getByTestId('ref-picker')
    expect(el.className).toMatch(/motion-safe:animate-ref-sheet-in/)
    // The list scrolls on its own (the header stays put), without chaining to the page.
    expect(el.querySelector('[data-ref-scroll]')?.className).toMatch(/overflow-y-auto/)
    expect(el.querySelector('[data-ref-scroll]')?.className).toMatch(/overscroll-contain/)
  })

  it('stays inside the side safe areas (notch in landscape)', () => {
    sheet()
    expect(screen.getByTestId('ref-picker').className).toMatch(/safe-area-inset-left/)
    expect(screen.getByTestId('ref-picker').className).toMatch(/safe-area-inset-right/)
  })

  it('shows no hover-only affordance: rows are selectable by tap alone (no group-hover/opacity-0 reveal)', () => {
    sheet()
    for (const row of screen.getAllByTestId('ref-option')) expect(row.innerHTML).not.toMatch(/group-hover|opacity-0/)
  })
})
