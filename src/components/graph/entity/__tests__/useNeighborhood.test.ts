import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { NeighborhoodParams, NeighborhoodResponse } from '@/services/neighborhood'

vi.mock('@/services/neighborhood', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/neighborhood')>()
  return { ...mod, neighborhoodApi: { get: vi.fn() } }
})

import { neighborhoodApi } from '@/services/neighborhood'
import { clearNeighborhoodCache, neighborhoodKey, useNeighborhood } from '../useNeighborhood'
import { noteNeighborhood } from './fixtures'

const get = vi.mocked(neighborhoodApi.get)

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const base: NeighborhoodParams = {
  entityType: 'note',
  entityId: 'n1',
  depth: 1,
  minWeight: 0.2,
}

beforeEach(() => {
  get.mockReset()
  clearNeighborhoodCache()
})

describe('useNeighborhood', () => {
  it('loads, then serves the same params from cache without refetching', async () => {
    const data = noteNeighborhood()
    get.mockResolvedValue(data)
    const { result, rerender } = renderHook((p: NeighborhoodParams) => useNeighborhood(p), {
      initialProps: base,
    })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe(data))
    expect(result.current.loading).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toMatchObject({ entityId: 'n1', depth: 1, minWeight: 0.2 })

    rerender({ ...base, depth: 2 })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ ...base }) // back to depth 1 → cache hit
    expect(result.current.data).toBe(data)
    expect(result.current.loading).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('aborts the stale request and ignores its late answer', async () => {
    const first = deferred<NeighborhoodResponse>()
    const second = deferred<NeighborhoodResponse>()
    get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result, rerender } = renderHook((p: NeighborhoodParams) => useNeighborhood(p), {
      initialProps: base,
    })
    const firstSignal = get.mock.calls[0][1]!
    expect(firstSignal.aborted).toBe(false)

    rerender({ ...base, minWeight: 0.5 })
    expect(firstSignal.aborted).toBe(true)
    const secondSignal = get.mock.calls[1][1]!
    expect(secondSignal.aborted).toBe(false)

    const fresh = { ...noteNeighborhood(), truncated: false }
    const stale = noteNeighborhood()
    await act(async () => {
      second.resolve(fresh)
      await second.promise
    })
    await act(async () => {
      first.resolve(stale) // arrives late — must be ignored
      await first.promise
    })
    expect(result.current.data).toBe(fresh)
  })

  it('reports errors (not aborts), keeps stale data, and retries', async () => {
    const data = noteNeighborhood()
    get.mockResolvedValueOnce(data)
    const { result, rerender } = renderHook((p: NeighborhoodParams) => useNeighborhood(p), {
      initialProps: base,
    })
    await waitFor(() => expect(result.current.data).toBe(data))

    get.mockRejectedValueOnce(new Error('boom'))
    rerender({ ...base, depth: 3 })
    await waitFor(() => expect(result.current.error?.message).toBe('boom'))
    expect(result.current.data).toBeUndefined()
    expect(result.current.staleData).toBe(data)
    expect(result.current.loading).toBe(false)

    get.mockResolvedValueOnce(data)
    act(() => result.current.retry())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toBe(data))
    expect(result.current.error).toBeUndefined()
  })

  it('does nothing without an entity', () => {
    const { result } = renderHook(() => useNeighborhood(null))
    expect(result.current.loading).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })

  it('normalizes keys (layer order, float noise)', () => {
    expect(neighborhoodKey({ ...base, layers: ['code', 'knowledge'] })).toBe(
      neighborhoodKey({ ...base, layers: ['knowledge', 'code'] })
    )
    expect(neighborhoodKey({ ...base, minWeight: 0.30000000000000004 })).toBe(
      neighborhoodKey({ ...base, minWeight: 0.3 })
    )
  })
})
