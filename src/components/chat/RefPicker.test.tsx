/**
 * The picker on its own: keyboard visibility, the cap, the search states and
 * the readable status. Run with: npx vitest run src/components/chat/RefPicker.test.tsx
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { RefSearchItem } from '@/refs/refsApi'
import type { RefSearchState } from '@/refs/useRefSearch'
import { RefPicker, refOptionId } from './RefPicker'

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

describe('RefPicker - the active option stays in view', () => {
  it('scrolls the active option into the visible area (nearest) when the arrows move it', () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    const { again } = picker(ready(many(50)))
    spy.mockClear()
    again({ activeIndex: 49 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.instances[0]).toBe(document.getElementById(refOptionId('L', 49)))
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
