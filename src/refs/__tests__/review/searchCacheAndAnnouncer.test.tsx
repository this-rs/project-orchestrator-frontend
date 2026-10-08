/**
 * The search cache belongs to a server, an account and a project (S2); the
 * live region speaks once and is emptied (B9).
 *
 * Run with: npx vitest run src/refs/__tests__/review/searchCacheAndAnnouncer.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { chatSelectedProjectAtom, currentUserAtom, refsAnnouncementAtom, chatServerFeaturesAtom } from '@/atoms'
import search from '@/refs/__fixtures__/search_response.json'
import { RefsAnnouncer, ANNOUNCEMENT_LIFETIME_MS } from '@/components/chat/RefsAnnouncer'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('@/refs/refsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/refs/refsApi')>()),
  refsApi: { search: searchMock },
}))

import { parseSearchResponse } from '@/refs/refsApi'
import { clearRefSearchCache, useRefSearch } from '@/refs/useRefSearch'

const items = parseSearchResponse(search.response)
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
})
afterEach(() => vi.useRealTimers())

describe('S2 - the search cache is scoped', () => {
  const setup = () => {
    const store = createStore()
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const hook = renderHook(() => useRefSearch({ query: 'ref', enabled: true }), { wrapper })
    return { store, ...hook }
  }
  it('the same query, same account, same project is served from the cache', async () => {
    const { rerender } = setup()
    await tick(200)
    rerender()
    expect(searchMock).toHaveBeenCalledTimes(1)
  })
  it('another account never reads the first account\'s answer', async () => {
    const { store } = setup()
    await tick(200)
    expect(searchMock).toHaveBeenCalledTimes(1)
    act(() => store.set(currentUserAtom, { id: 'u2' } as never))
    await tick(200)
    expect(searchMock).toHaveBeenCalledTimes(2)
  })
  it('another project asks again', async () => {
    const { store } = setup()
    await tick(200)
    act(() => store.set(chatSelectedProjectAtom, { id: 'p2' } as never))
    await tick(200)
    expect(searchMock).toHaveBeenCalledTimes(2)
  })
  it('going back to the first account asks again: the purge emptied the cache', async () => {
    const { store } = setup()
    await tick(200)
    act(() => store.set(currentUserAtom, { id: 'u2' } as never))
    await tick(200)
    act(() => store.set(currentUserAtom, null))
    await tick(200)
    expect(searchMock).toHaveBeenCalledTimes(3)
  })
})

describe('B9 - the live region speaks once', () => {
  const mount = () => {
    const store = createStore()
    store.set(chatServerFeaturesAtom, ['refs_v1'])
    render(<Provider store={store}><RefsAnnouncer /></Provider>)
    return store
  }
  it('is emptied after the announcement, so the same sentence next turn is a change again', async () => {
    const store = mount()
    const region = screen.getByTestId('refs-announcer')
    act(() => store.set(refsAnnouncementAtom, '1 reference unavailable: Task 3adeffc9'))
    expect(region.textContent).toBe('1 reference unavailable: Task 3adeffc9')
    await tick(ANNOUNCEMENT_LIFETIME_MS + 1)
    expect(store.get(refsAnnouncementAtom)).toBe('')
    expect(region.textContent).toBe('')
    act(() => store.set(refsAnnouncementAtom, '1 reference unavailable: Task 3adeffc9'))
    expect(region.textContent).toBe('1 reference unavailable: Task 3adeffc9')
  })
  it('renders nothing without refs_v1', () => {
    const store = createStore()
    render(<Provider store={store}><RefsAnnouncer /></Provider>)
    expect(screen.queryByTestId('refs-announcer')).toBeNull()
  })
})
