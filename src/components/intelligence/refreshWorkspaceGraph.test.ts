import { describe, it, expect, vi, beforeEach } from 'vitest'

const getWorkspaceGraph = vi.fn()
vi.mock('@/services/intelligence', () => ({
  intelligenceApi: { getWorkspaceGraph: (...a: unknown[]) => getWorkspaceGraph(...a) },
}))

import { FULL_RELOAD_AFTER_MS } from './graphDelta'
import { refreshWorkspaceGraph } from './useWorkspaceIntelligenceGraph'

const n = (id: string) => ({ id, type: 'file', label: id, layer: 'code' })
const NOW = 9_000_000
const stale = {
  projects: [{ id: 'p1' }],
  nodes: [n('a'), n('b')],
  edges: [{ source: 'a', target: 'b', type: 'IMPORTS', layer: 'code' }],
  communities: [],
  stats: {},
  cross_project_edges: [{ source: 'a', target: 'b', type: 'SHARES', layer: 'code' }],
  synced_at: 'c1',
  deletions_tracked: true,
  loaded_full_at: NOW - 60_000,
}
const refresh = (s: unknown, signal?: AbortSignal, now = NOW) =>
  refreshWorkspaceGraph('ws', ['code'], 500, s as never, signal, now)

describe('refreshWorkspaceGraph', () => {
  beforeEach(() => getWorkspaceGraph.mockReset())

  it('asks only for the delta and folds nodes, edges, cross-project edges and projects', async () => {
    getWorkspaceGraph.mockResolvedValueOnce({
      projects: [{ id: 'p1' }, { id: 'p2' }],
      nodes: [n('c')],
      edges: [],
      communities: [],
      stats: {},
      cross_project_edges: [{ source: 'c', target: 'a', type: 'SHARES', layer: 'code' }],
      synced_at: 'c2',
      deletions_tracked: true,
      deleted_nodes: [{ id: 'b' }],
    })
    const out = await refresh(stale)
    expect(getWorkspaceGraph.mock.calls[0][1]).toMatchObject({ since: 'c1', includeDeleted: true })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.edges).toEqual([])
    expect(out.cross_project_edges.map((e) => `${e.source}>${e.target}`)).toEqual(['c>a'])
    expect(out.projects).toHaveLength(2)
    expect(out.synced_at).toBe('c2')
    expect(out.loaded_full_at).toBe(stale.loaded_full_at)
  })

  it('reloads in FULL past the bound, and dates the new snapshot', async () => {
    getWorkspaceGraph.mockResolvedValueOnce({ projects: [], nodes: [n('x')], edges: [], communities: [], stats: {}, cross_project_edges: [], synced_at: 'f' })
    const out = await refresh({ ...stale, loaded_full_at: NOW - FULL_RELOAD_AFTER_MS - 1 })
    expect(getWorkspaceGraph.mock.calls[0][1].since).toBeUndefined()
    expect(out.loaded_full_at).toBe(NOW)
  })

  it('falls back to a full load when deletions could not be tracked, or the delta fails', async () => {
    getWorkspaceGraph
      .mockResolvedValueOnce({ projects: [], nodes: [], edges: [], communities: [], stats: {}, cross_project_edges: [], deletions_tracked: false })
      .mockResolvedValueOnce({ projects: [], nodes: [n('x')], edges: [], communities: [], stats: {}, cross_project_edges: [], synced_at: 'f' })
    expect((await refresh(stale)).nodes.map((x) => x.id)).toEqual(['x'])
    getWorkspaceGraph
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ projects: [], nodes: [n('y')], edges: [], communities: [], stats: {}, cross_project_edges: [], synced_at: 'f' })
    expect((await refresh(stale)).nodes.map((x) => x.id)).toEqual(['y'])
  })

  it('loads in full, asking for a cursor, when nothing is cached', async () => {
    getWorkspaceGraph.mockResolvedValueOnce({ projects: [], nodes: [], edges: [], communities: [], stats: {}, cross_project_edges: [], synced_at: 'f' })
    await refresh(null)
    expect(getWorkspaceGraph.mock.calls[0][1]).toMatchObject({ includeDeleted: true })
    expect(getWorkspaceGraph.mock.calls[0][1].since).toBeUndefined()
  })

  it('an abort is not swallowed by the fallback', async () => {
    const ac = new AbortController()
    ac.abort()
    getWorkspaceGraph.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(refresh(stale, ac.signal)).rejects.toBeTruthy()
    expect(getWorkspaceGraph).toHaveBeenCalledTimes(1)
  })
})
