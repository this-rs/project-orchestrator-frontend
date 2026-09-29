import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useInfiniteList } from '../useInfiniteList'

// A controllable IntersectionObserver: like the real one, it only calls back when told to
// (observe() = a fresh notification with the current state, unobserve() = none).
let callbacks: Array<() => void> = []
class FakeIO {
  private cb: IntersectionObserverCallback
  private nodes = new Set<Element>()
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    callbacks.push(() => {
      if (this.nodes.size) this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never)
    })
  }
  observe(n: Element) {
    this.nodes.add(n)
    // The real observer reports the initial state on observe().
    queueMicrotask(() => this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never))
  }
  unobserve(n: Element) {
    this.nodes.delete(n)
  }
  disconnect() {
    this.nodes.clear()
  }
}

const page = (offset: number, size: number, total: number) => ({
  items: Array.from({ length: Math.min(size, total - offset) }, (_, i) => ({ id: `n${offset + i}` })),
  total,
  limit: size,
  offset,
})

describe('useInfiniteList', () => {
  beforeEach(() => {
    callbacks = []
    vi.stubGlobal('IntersectionObserver', FakeIO)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps loading while the sentinel stays in view (no scroll event needed)', async () => {
    const fetcher = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => page(offset, limit, 100))
    const { result } = renderHook(() => useInfiniteList({ fetcher, pageSize: 25 }))
    await waitFor(() => expect(result.current.items.length).toBe(25))
    act(() => result.current.sentinelRef(document.createElement('div')))
    await waitFor(() => expect(result.current.items.length).toBe(100))
    expect(result.current.hasMore).toBe(false)
  })

  it('does not silently end the list when a page fails: it exposes an error and can retry', async () => {
    let fail = true
    const fetcher = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => {
      if (offset >= 25 && fail) throw new Error('boom')
      return page(offset, limit, 60)
    })
    const { result } = renderHook(() => useInfiniteList({ fetcher, pageSize: 25 }))
    await waitFor(() => expect(result.current.items.length).toBe(25))
    act(() => result.current.sentinelRef(document.createElement('div')))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.hasMore).toBe(true)
    expect(result.current.sentinelProps.remaining).toBe(35)

    fail = false
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items.length).toBe(60))
    expect(result.current.error).toBe(false)
  })
})
