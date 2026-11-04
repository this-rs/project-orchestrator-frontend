import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { graphNodeLimitAtom, visibleLayersAtom } from '@/atoms/intelligence'
import type { IntelligenceLayer } from '@/types/intelligence'
import { graphCacheClear } from './graphCache'

const intelligenceApi = vi.hoisted(() => ({
  getGraph: vi.fn(),
  getSummary: vi.fn(),
  getWorkspaceGraph: vi.fn(),
  getWorkspaceSummary: vi.fn(),
}))
vi.mock('@/services/intelligence', () => ({ intelligenceApi }))

import { useIntelligenceGraph } from './useIntelligenceGraph'
import { useWorkspaceIntelligenceGraph } from './useWorkspaceIntelligenceGraph'

const EMPTY = { nodes: [], edges: [], communities: [], stats: {}, projects: [], cross_project_edges: [] }
const LAYERS: IntelligenceLayer[] = ['code', 'fabric', 'knowledge', 'skills', 'behavioral', 'pm']

beforeEach(() => {
  graphCacheClear()
  vi.clearAllMocks()
  intelligenceApi.getGraph.mockResolvedValue(EMPTY)
  intelligenceApi.getWorkspaceGraph.mockResolvedValue(EMPTY)
  intelligenceApi.getSummary.mockResolvedValue({ layers: {}, totalNodes: 0, totalEdges: 0 })
  intelligenceApi.getWorkspaceSummary.mockResolvedValue({ aggregated: { layers: {}, totalNodes: 0, totalEdges: 0 } })
})

/** Σ over the requests of (per-layer limit × layers asked): the most the API may return. */
const requested = (calls: unknown[][]) =>
  calls.reduce((s, c) => {
    const params = c[1] as { layers: string[]; limit: number }
    return s + params.limit * params.layers.length
  }, 0)

function storeWith(limit: number) {
  const store = createStore()
  store.set(visibleLayersAtom, new Set(LAYERS))
  store.set(graphNodeLimitAtom, limit)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return wrapper
}

describe('progressive loading keeps the node limit a TOTAL budget', () => {
  // The first paint asks for code + fabric, then for the other four layers.
  // Each call used to split `limit` over ITS OWN layers: 1 200 over two
  // layers, then 1 200 again over four — 2 400 requested for a limit of 1 200.
  it('project view', async () => {
    renderHook(() => useIntelligenceGraph('p'), { wrapper: storeWith(1200) })
    await waitFor(() => expect(intelligenceApi.getGraph).toHaveBeenCalledTimes(2))
    expect(requested(intelligenceApi.getGraph.mock.calls)).toBeLessThanOrEqual(1200)
  })

  it('workspace view', async () => {
    renderHook(() => useWorkspaceIntelligenceGraph('ws'), { wrapper: storeWith(1200) })
    await waitFor(() => expect(intelligenceApi.getWorkspaceGraph).toHaveBeenCalledTimes(2))
    expect(requested(intelligenceApi.getWorkspaceGraph.mock.calls)).toBeLessThanOrEqual(1200)
  })
})
