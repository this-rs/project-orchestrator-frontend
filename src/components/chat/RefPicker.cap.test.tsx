/**
 * The picker on its own: keyboard visibility, the cap, the search states and
 * the readable status. Run with: npx vitest run src/components/chat/RefPicker.test.tsx
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

describe('RefPicker - at the cap', () => {
  it('greys the options, says why in a visible message, and lets an already-added reference through', () => {
    const items = many(3)
    picker(ready(items), { full: true, isInDraft: (it) => it.id === items[1].id })
    const opts = screen.getAllByRole('option')
    expect(opts[0].getAttribute('aria-disabled')).toBe('true')
    expect(opts[0].className).toContain('opacity-')
    expect(opts[0].className).toContain('cursor-not-allowed')
    expect(opts[1].getAttribute('aria-disabled')).toBeNull()
    const msg = screen.getByTestId('ref-picker-limit')
    expect(msg.textContent).toMatch(/maximum.*20/i)
    expect(msg.className).not.toContain('text-[11px]')
  })
})
