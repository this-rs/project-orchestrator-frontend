import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import search from '../__fixtures__/search_response.json'
import { ApiError } from '@/services/api'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('../refsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../refsApi')>()),
  refsApi: { search: searchMock },
}))

import { parseSearchResponse } from '../refsApi'
import { SEARCH_DEBOUNCE_MS, clearRefSearchCache, useRefSearch } from '../useRefSearch'

const items = parseSearchResponse(search.response)
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  searchMock.mockReset()
  clearRefSearchCache()
})
afterEach(() => vi.useRealTimers())

describe('useRefSearch', () => {
  it('is idle and asks nothing while disabled', async () => {
    const { result } = renderHook(() => useRefSearch({ query: 'a', enabled: false }))
    await tick(1000)
    expect(result.current).toEqual({ status: 'idle', items: [] })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('waits 150 ms after the last keystroke, then asks once with the final query', async () => {
    searchMock.mockResolvedValue(items)
    const { result, rerender } = renderHook(({ q }) => useRefSearch({ query: q, enabled: true }), { initialProps: { q: 'r' } })
    expect(SEARCH_DEBOUNCE_MS).toBe(150)
    await tick(100)
    rerender({ q: 're' })
    await tick(100)
    rerender({ q: 'ref' })
    await tick(149)
    expect(searchMock).not.toHaveBeenCalled()
    expect(result.current.status).toBe('loading')
    await tick(1)
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock.mock.calls[0][0]).toMatchObject({ q: 'ref' })
    expect(result.current).toEqual({ status: 'ready', items })
  })

  it('aborts the request of a query the user typed past, and ignores its late answer', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    searchMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    searchMock.mockResolvedValueOnce([items[1]])
    const { result, rerender } = renderHook(({ q }) => useRefSearch({ query: q, enabled: true }), { initialProps: { q: 'a' } })
    await tick(150)
    const firstSignal = searchMock.mock.calls[0][1] as AbortSignal
    expect(firstSignal.aborted).toBe(false)
    rerender({ q: 'ab' })
    expect(firstSignal.aborted).toBe(true)
    await tick(150)
    expect(result.current.items).toEqual([items[1]])
    // the stale answer arrives now and must change nothing
    await act(async () => resolveFirst(items))
    expect(result.current.items).toEqual([items[1]])
  })

  it('never shows the previous query\'s list under a new query', async () => {
    searchMock.mockResolvedValue(items)
    const { result, rerender } = renderHook(({ q }) => useRefSearch({ query: q, enabled: true }), { initialProps: { q: 'a' } })
    await tick(150)
    expect(result.current.items).toHaveLength(3)
    rerender({ q: 'ab' })
    expect(result.current).toEqual({ status: 'loading', items: [] })
  })

  it('answers a repeated (kinds, query) from the cache, without a request', async () => {
    searchMock.mockResolvedValue(items)
    const first = renderHook(() => useRefSearch({ query: 'Refs', kinds: ['plan', 'rfc'], enabled: true }))
    await tick(150)
    first.unmount()
    const again = renderHook(() => useRefSearch({ query: ' refs ', kinds: ['rfc', 'plan'], enabled: true }))
    expect(again.result.current).toEqual({ status: 'ready', items })
    await tick(500)
    expect(searchMock).toHaveBeenCalledTimes(1)
    // another kind set is another entry
    renderHook(() => useRefSearch({ query: 'refs', kinds: ['task'], enabled: true }))
    await tick(150)
    expect(searchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets a cached answer after 30 s', async () => {
    searchMock.mockResolvedValue(items)
    const a = renderHook(() => useRefSearch({ query: 'x', enabled: true }))
    await tick(150)
    a.unmount()
    await tick(31_000)
    renderHook(() => useRefSearch({ query: 'x', enabled: true }))
    await tick(150)
    expect(searchMock).toHaveBeenCalledTimes(2)
  })

  it('reports an error with the server sentence for refs_invalid, a generic one otherwise', async () => {
    searchMock.mockRejectedValueOnce(new ApiError(400, JSON.stringify({ error: 'search text is too long', code: 'refs_invalid', reason: 'query_too_long' })))
    const a = renderHook(() => useRefSearch({ query: 'x', enabled: true }))
    await tick(150)
    expect(a.result.current).toEqual({ status: 'error', items: [], message: 'search text is too long' })
    searchMock.mockRejectedValueOnce(new Error('network down'))
    const b = renderHook(() => useRefSearch({ query: 'y', enabled: true }))
    await tick(150)
    expect(b.result.current).toMatchObject({ status: 'error', message: 'network down' })
  })
})
