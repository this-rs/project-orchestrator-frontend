import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncrementalList } from '../useIncrementalList'

const items = Array.from({ length: 120 }, (_, i) => i)

describe('useIncrementalList', () => {
  it('shows one page, reveals more, and resets when the key changes', () => {
    const { result, rerender } = renderHook(({ key }) => useIncrementalList(items, 50, key), {
      initialProps: { key: 'a' },
    })
    expect(result.current.visible).toHaveLength(50)
    expect(result.current.remaining).toBe(70)
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(100)
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(120)
    expect(result.current.hasMore).toBe(false)
    rerender({ key: 'b' })
    expect(result.current.visible).toHaveLength(50)
    act(() => result.current.showMore())
    expect(result.current.visible).toHaveLength(100)
  })
})
