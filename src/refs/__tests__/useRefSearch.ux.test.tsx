import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import search from '../__fixtures__/search_response.json'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('../refsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../refsApi')>()),
  refsApi: { search: searchMock },
}))

import { parseSearchResponse } from '../refsApi'
import { SEARCH_DEBOUNCE_MS, SEARCH_TIMEOUT_MS, clearRefSearchCache, useRefSearch } from '../useRefSearch'

const items = parseSearchResponse(search.response)
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  searchMock.mockReset()
  clearRefSearchCache()
})
afterEach(() => vi.useRealTimers())

describe('useRefSearch - a request that never answers', () => {
  it('gives up after the timeout with a readable message and a retry', async () => {
    searchMock.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useRefSearch({ query: 'a', enabled: true }))
    await tick(SEARCH_TIMEOUT_MS - 1)
    expect(result.current.status).toBe('loading')
    await tick(2)
    expect(result.current.status).toBe('error')
    const r = result.current as Extract<typeof result.current, { status: 'error' }>
    expect(r.message).toMatch(/too long|try again/i)
    expect(searchMock.mock.calls[0][1].aborted).toBe(true)
    expect(typeof r.retry).toBe('function')
  })

  it('retry asks again at once, without the debounce', async () => {
    searchMock.mockRejectedValueOnce(new Error('Failed to fetch'))
    searchMock.mockResolvedValueOnce(items)
    const { result } = renderHook(() => useRefSearch({ query: 'a', enabled: true }))
    await tick(1)
    const err = result.current as Extract<typeof result.current, { status: 'error' }>
    expect(err.status).toBe('error')
    expect(err.message).not.toContain('Failed to fetch')
    act(() => err.retry())
    await tick(1)
    expect(searchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toMatchObject({ status: 'ready', items })
  })
})

describe('useRefSearch - the list does not blink', () => {
  it('keeps the previous list (loading) while the next query runs', async () => {
    searchMock.mockResolvedValue(items)
    const { result, rerender } = renderHook(({ q }) => useRefSearch({ query: q, enabled: true }), { initialProps: { q: 'a' } })
    await tick(1)
    expect(result.current.items).toHaveLength(3)
    searchMock.mockImplementation(() => new Promise(() => {}))
    rerender({ q: 'ab' })
    expect(result.current).toEqual({ status: 'loading', items })
    await tick(SEARCH_DEBOUNCE_MS)
    expect(result.current).toEqual({ status: 'loading', items })
  })
})

describe('useRefSearch - the first request is not debounced', () => {
  it('asks at once when the picker opens, debounces the following keystrokes', async () => {
    searchMock.mockResolvedValue(items)
    const { rerender } = renderHook(({ q }) => useRefSearch({ query: q, enabled: true }), { initialProps: { q: 'a' } })
    await tick(1)
    expect(searchMock).toHaveBeenCalledTimes(1)
    rerender({ q: 'ab' })
    await tick(SEARCH_DEBOUNCE_MS - 1)
    expect(searchMock).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(searchMock).toHaveBeenCalledTimes(2)
  })
})
