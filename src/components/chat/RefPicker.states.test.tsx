/**
 * The picker on its own: keyboard visibility, the cap, the search states and
 * the readable status. Run with: npx vitest run src/components/chat/RefPicker.test.tsx
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RefSearchItem } from '@/refs/refsApi'
import type { RefSearchState } from '@/refs/useRefSearch'
import { RefPicker } from './RefPicker'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const many = (n: number, extra: Partial<RefSearchItem> = {}): RefSearchItem[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'task' as const,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    label: `Task number ${i}`,
    ...extra,
  }))

const ready = (items: RefSearchItem[]): RefSearchState => ({ status: 'ready', items })

function picker(search: RefSearchState, over: Partial<React.ComponentProps<typeof RefPicker>> = {}) {
  const props = { listId: 'L', search, activeIndex: 0, full: false, onPick: vi.fn(), onHover: vi.fn(), ...over }
  const view = render(<RefPicker {...props} />)
  return { ...view, props, again: (next: Partial<typeof props>) => view.rerender(<RefPicker {...props} {...next} />) }
}

describe('RefPicker - search states', () => {
  it('loading has a visible indicator', () => {
    picker({ status: 'loading', items: [] })
    expect(screen.getByTestId('ref-picker-spinner')).toBeTruthy()
    expect(screen.getByTestId('ref-picker-status').textContent).toContain('Searching')
  })

  it('an error is readable and offers a retry', () => {
    const retry = vi.fn()
    picker({ status: 'error', items: [], message: 'The search is unavailable right now.', retry })
    expect(screen.getByTestId('ref-picker-status').textContent).toContain('The search is unavailable right now.')
    expect(screen.getByTestId('ref-picker-status').textContent).not.toContain('Search failed')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('no results is a sentence, not a 11 px murmur', () => {
    picker(ready([]))
    const s = screen.getByTestId('ref-picker-status')
    expect(s.textContent).toBe('No results')
    expect(s.className).not.toContain('text-[11px]')
  })

  it('keeps the previous list on screen while the next search runs, but nothing is active', () => {
    picker({ status: 'loading', items: many(3) })
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true)
  })
})
