import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { planRefreshAtom, taskRefreshAtom } from '@/atoms'

const getDependencyGraph = vi.fn()
const getWaves = vi.fn()

vi.mock('@/services', () => ({
  plansApi: {
    getDependencyGraph: (...a: unknown[]) => getDependencyGraph(...a),
    getWaves: (...a: unknown[]) => getWaves(...a),
    listConstraints: vi.fn().mockResolvedValue([]),
    getCommits: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn().mockResolvedValue({ plan: { title: 'P', project_id: 'proj' }, tasks: [] }),
  },
  featureGraphsApi: { get: vi.fn(), list: vi.fn().mockResolvedValue({ feature_graphs: [] }) },
  chatApi: { listSessions: vi.fn().mockResolvedValue({ items: [] }) },
  commitsApi: { getCommitFiles: vi.fn().mockResolvedValue({ items: [] }) },
}))

import { usePlanGraphData } from '../usePlanGraphData'

const node = (id: string) => ({ id, title: id, status: 'pending' })
const graphOf = (edges: Array<{ from: string; to: string }>) => ({
  nodes: [node('a'), node('b')],
  edges,
  conflicts: [],
  feature_graphs: [],
})

function setup() {
  const store = createStore()
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  const hook = renderHook(() => usePlanGraphData('plan-1', 'P', 'slug'), { wrapper })
  return { store, ...hook }
}

describe('usePlanGraphData — temps réel', () => {
  beforeEach(() => {
    getDependencyGraph.mockReset()
    getWaves.mockReset()
  })

  it('refetches the dependency graph when taskRefreshAtom is bumped (a dependency was added)', async () => {
    getDependencyGraph.mockResolvedValueOnce(graphOf([]))
    const { store, result } = setup()
    await waitFor(() => expect(result.current.graph).not.toBeNull())
    expect(result.current.graph!.edges).toHaveLength(0)

    getDependencyGraph.mockResolvedValueOnce(graphOf([{ from: 'a', to: 'b' }]))
    act(() => store.set(taskRefreshAtom, (c) => c + 1))

    await waitFor(() => expect(result.current.graph!.edges).toHaveLength(1))
    expect(getDependencyGraph).toHaveBeenCalledTimes(2)
  })

  it('refetches when planRefreshAtom is bumped', async () => {
    getDependencyGraph.mockResolvedValue(graphOf([]))
    const { store, result } = setup()
    await waitFor(() => expect(result.current.graph).not.toBeNull())

    act(() => store.set(planRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(getDependencyGraph).toHaveBeenCalledTimes(2))
  })

  it('refreshes silently: isLoading never goes back to true and the data stays visible', async () => {
    getDependencyGraph.mockResolvedValueOnce(graphOf([]))
    const { store, result } = setup()
    await waitFor(() => expect(result.current.graph).not.toBeNull())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let release: (g: unknown) => void = () => {}
    getDependencyGraph.mockReturnValueOnce(new Promise((r) => (release = r)))
    act(() => store.set(taskRefreshAtom, (c) => c + 1))

    await waitFor(() => expect(getDependencyGraph).toHaveBeenCalledTimes(2))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.graph).not.toBeNull()

    await act(async () => release(graphOf([{ from: 'a', to: 'b' }])))
    await waitFor(() => expect(result.current.graph!.edges).toHaveLength(1))
    expect(result.current.isLoading).toBe(false)
  })

  it('applies only the latest response when refreshes overlap (a slow older answer must not win)', async () => {
    getDependencyGraph.mockResolvedValueOnce(graphOf([]))
    const { store, result } = setup()
    await waitFor(() => expect(result.current.graph).not.toBeNull())

    let releaseSlow: (g: unknown) => void = () => {}
    getDependencyGraph.mockReturnValueOnce(new Promise((r) => (releaseSlow = r))) // older, slow
    getDependencyGraph.mockResolvedValueOnce(graphOf([{ from: 'a', to: 'b' }])) // newer, fast

    act(() => store.set(taskRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(getDependencyGraph).toHaveBeenCalledTimes(2))
    act(() => store.set(taskRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(result.current.graph!.edges).toHaveLength(1))

    await act(async () => releaseSlow(graphOf([]))) // stale answer arrives last
    expect(result.current.graph!.edges).toHaveLength(1)
  })

  it('refreshes the waves on an event only if they were already loaded', async () => {
    getDependencyGraph.mockResolvedValue(graphOf([]))
    getWaves.mockResolvedValue({ waves: [], summary: {} })
    const { store, result } = setup()
    await waitFor(() => expect(result.current.graph).not.toBeNull())

    act(() => store.set(taskRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(getDependencyGraph).toHaveBeenCalledTimes(2))
    expect(getWaves).not.toHaveBeenCalled() // never requested → not fetched behind the user's back

    await act(async () => { await result.current.fetchWaves() })
    expect(getWaves).toHaveBeenCalledTimes(1)

    act(() => store.set(taskRefreshAtom, (c) => c + 1))
    await waitFor(() => expect(getWaves).toHaveBeenCalledTimes(2))
  })
})
