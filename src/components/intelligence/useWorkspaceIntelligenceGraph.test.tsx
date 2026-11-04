import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { graphLoadingStagesAtom } from '@/atoms/intelligence'
import { graphCacheClear } from './graphCache'

const intelligenceApi = vi.hoisted(() => ({ getWorkspaceGraph: vi.fn(), getWorkspaceSummary: vi.fn() }))
vi.mock('@/services/intelligence', () => ({ intelligenceApi }))

import { useWorkspaceIntelligenceGraph } from './useWorkspaceIntelligenceGraph'

// A worker that is never answered: the dagre worker's real behaviour at
// 2 000 nodes (> 2 min), or after it crashed. Nothing on the workspace page
// may wait on it.
const constructed: string[] = []
class SilentWorker {
  constructor(url: URL | string) {
    constructed.push(String(url))
  }
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}
let savedWorker: unknown
beforeEach(() => {
  graphCacheClear()
  constructed.length = 0
  savedWorker = (globalThis as { Worker?: unknown }).Worker
  ;(globalThis as { Worker?: unknown }).Worker = SilentWorker
  intelligenceApi.getWorkspaceGraph.mockImplementation((_slug: string, params: { layers?: string[] }) =>
    Promise.resolve(params.layers?.includes('code') ? codeGraph() : { projects: [], communities: [], nodes: [], edges: [], cross_project_edges: [] }),
  )
  intelligenceApi.getWorkspaceSummary.mockResolvedValue({ aggregated: { layers: {}, totalNodes: 30, totalEdges: 0 } })
})

function codeGraph() {
  return {
    projects: [],
    communities: [],
    nodes: Array.from({ length: 30 }, (_, i) => ({
      id: `file:src/f${i}.ts`,
      type: 'file',
      label: `f${i}.ts`,
      layer: 'code',
      attributes: { path: `src/f${i}.ts`, project_slug: 'p' },
    })),
    edges: [],
    cross_project_edges: [],
  }
}
afterEach(() => {
  ;(globalThis as { Worker?: unknown }).Worker = savedWorker
})

describe('useWorkspaceIntelligenceGraph', () => {
  it('hands the visible set to the 3D view without waiting on a 2D layout', async () => {
    const store = createStore()
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const { result } = renderHook(() => useWorkspaceIntelligenceGraph('ws'), { wrapper })
    await waitFor(() => expect(result.current.nodes).toHaveLength(30))
    // The "layout" stage completes: it used to stay "loading" until a worker
    // answered — forever when the worker errored.
    await waitFor(() => {
      const layout = store.get(graphLoadingStagesAtom).find((s) => s.id === 'layout')
      expect(layout?.status).toBe('done')
    })
    // No dagre worker is started at all: the 3D view places nodes itself.
    expect(constructed.filter((u) => u.includes('dagre'))).toEqual([])
  })
})
