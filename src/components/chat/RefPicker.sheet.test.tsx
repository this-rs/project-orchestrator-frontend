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
import { I18nContext } from '@/i18n/context'
import { loadLocale } from '@/i18n/store'
import { createTranslator } from '@/i18n/translate'
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

  it('kind chips are 44px touch targets (36px drawn, the ::before extends the hit area 4px above and below)', () => {
    sheet({ onChipKind: vi.fn() })
    const chips = screen.getAllByTestId('ref-kind-chip')
    expect(chips.length).toBeGreaterThan(1)
    for (const c of chips) {
      expect(c.className).toMatch(/\bh-9\b/)
      expect(c.className).toMatch(/\brelative\b/)
      expect(c.className).toMatch(/\bbefore:-inset-y-1\b/)
    }
    // The row keeps 4px above and below the chips (py-1), so the extended area is not clipped by the scroller.
    expect(screen.getByTestId('ref-kind-chips').className).toMatch(/\bpy-1\b/)
  })

  it('the chip row fades out on the right and ends with a spacer, so a narrow screen shows that it scrolls', () => {
    sheet({ onChipKind: vi.fn() })
    const row = screen.getByTestId('ref-kind-chips')
    expect(row.className).toMatch(/mask-image:linear-gradient\(to_right/)
    expect(row.className).toMatch(/\boverflow-x-auto\b/)
    expect(row.lastElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('counts results with a singular and a plural', () => {
    sheet({ search: { status: 'ready', items: items.slice(0, 1) } as never })
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('1 result')
    cleanup()
    sheet()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe(`${items.length} results`)
  })

  it('speaks the language of the interface', async () => {
    const bundle = await loadLocale('fr')
    const value = { ...createTranslator('fr', bundle), requested: 'fr' as const, setLocale: () => {} }
    const anchor = document.createElement('div')
    document.body.append(anchor)
    render(
      <I18nContext.Provider value={value}>
        <RefPicker listId="L" search={{ status: 'ready', items } as never} activeIndex={0} full={false} onPick={vi.fn()} onHover={vi.fn()} sheet anchor={anchor} onClose={vi.fn()} onChipKind={vi.fn()} />
      </I18nContext.Provider>,
    )
    expect(screen.getByRole('group', { name: 'Filtrer par type' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tout' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fermer les références' })).toBeTruthy()
    expect(screen.getByTestId('ref-picker-query').textContent).toBe('#rechercher')
    expect(screen.getByTestId('ref-picker-status').textContent).toBe(`${items.length} résultats`)
  })
})
