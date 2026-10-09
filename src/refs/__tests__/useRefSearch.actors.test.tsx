import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import kindsFixture from '../__fixtures__/kinds_response.json'
import { clearRefKinds, parseKindsResponse, setActiveKinds } from '../kinds'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('../refsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../refsApi')>()),
  refsApi: { search: searchMock },
}))

import { clearRefSearchCache, useRefSearch } from '../useRefSearch'

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  searchMock.mockReset()
  searchMock.mockResolvedValue([])
  clearRefSearchCache()
})
afterEach(() => {
  vi.useRealTimers()
  clearRefKinds()
})

describe('useRefSearch with a sigil', () => {
  it('@ without any actor kind on the server is ready and empty at once, and asks nothing', async () => {
    const { result } = renderHook(() => useRefSearch({ query: '', sigil: '@', enabled: true }))
    await tick(1000)
    expect(result.current).toEqual({ status: 'ready', items: [] })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('@ searches the actor kinds the server lists, # the others', async () => {
    setActiveKinds(parseKindsResponse(kindsFixture.response)!)
    renderHook(() => useRefSearch({ query: 'a', sigil: '@', enabled: true }))
    await tick(1)
    expect(searchMock.mock.calls[0][0].kinds).toEqual(['persona', 'skill'])
    searchMock.mockClear()
    renderHook(() => useRefSearch({ query: 'b', sigil: '#', enabled: true }))
    await tick(1)
    const asked = searchMock.mock.calls[0][0].kinds as string[]
    expect(asked).not.toContain('persona')
    expect(asked).toHaveLength(14)
  })
})
