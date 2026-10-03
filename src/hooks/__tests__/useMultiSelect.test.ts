import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiSelect } from '../useMultiSelect'

const id = (x: { id: string }) => x.id
const A = [{ id: 'a' }, { id: 'b' }]

describe('useMultiSelect', () => {
  it('a selection made on the rows currently shown survives the render that showed them', () => {
    // Regression: the reset ran in an effect AFTER the render, so a click landing between
    // the commit and that effect was wiped (flaky ProjectsPage test under CI load).
    const { result, rerender } = renderHook(({ items }) => useMultiSelect(items, id), {
      initialProps: { items: [] as typeof A },
    })
    rerender({ items: A })
    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.selectionCount).toBe(1)
  })

  it('is empty as soon as the items array changes (pagination, filter, reload)', () => {
    const { result, rerender } = renderHook(({ items }) => useMultiSelect(items, id), {
      initialProps: { items: A },
    })
    act(() => result.current.toggle('a'))
    expect(result.current.selectionCount).toBe(1)
    rerender({ items: [...A] })
    expect(result.current.selectionCount).toBe(0)
    expect(result.current.isSelected('a')).toBe(false)
  })

  it('select-all then clear', () => {
    const { result } = renderHook(() => useMultiSelect(A, id))
    act(() => result.current.toggleAll())
    expect(result.current.isAllSelected).toBe(true)
    act(() => result.current.clear())
    expect(result.current.selectionCount).toBe(0)
  })
})
