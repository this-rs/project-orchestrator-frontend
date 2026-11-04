import { describe, it, expect, vi, beforeEach } from 'vitest'

const getGraph = vi.fn()
vi.mock('@/services/intelligence', () => ({ intelligenceApi: { getGraph: (...a: unknown[]) => getGraph(...a) } }))

import { refreshProjectGraph } from './useIntelligenceGraph'

const n = (id: string) => ({ id, type: 'file', label: id, layer: 'code' })
const stale = {
  nodes: [n('a'), n('b')],
  edges: [{ source: 'a', target: 'b', type: 'IMPORTS', layer: 'code' }],
  communities: [],
  stats: {},
  synced_at: '2026-11-04T10:00:00Z',
  deletions_tracked: true,
}

describe('refreshProjectGraph', () => {
  beforeEach(() => getGraph.mockReset())

  it('asks only for the delta since the cursor, and folds it into the snapshot', async () => {
    getGraph.mockResolvedValueOnce({
      nodes: [n('c')],
      edges: [],
      communities: [],
      stats: {},
      synced_at: '2026-11-04T10:05:00Z',
      deletions_tracked: true,
      deleted_nodes: [{ id: 'b' }],
    })
    const out = await refreshProjectGraph('p', ['code'], 500, stale as never)
    expect(getGraph).toHaveBeenCalledTimes(1)
    expect(getGraph.mock.calls[0][1]).toMatchObject({ since: stale.synced_at, includeDeleted: true })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.edges).toEqual([])
    expect(out.synced_at).toBe('2026-11-04T10:05:00Z')
  })

  it('falls back to a full load when the deletions could not be tracked', async () => {
    getGraph
      .mockResolvedValueOnce({ nodes: [], edges: [], communities: [], stats: {}, deletions_tracked: false })
      .mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'full' })
    const out = await refreshProjectGraph('p', ['code'], 500, stale as never)
    expect(getGraph).toHaveBeenCalledTimes(2)
    expect(out.nodes.map((x) => x.id)).toEqual(['x'])
  })

  it('loads in full when there is no cursor yet', async () => {
    getGraph.mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'c' })
    await refreshProjectGraph('p', ['code'], 500, null)
    expect(getGraph).toHaveBeenCalledTimes(1)
    expect(getGraph.mock.calls[0][1]).toMatchObject({ includeDeleted: true })
    expect(getGraph.mock.calls[0][1].since).toBeUndefined()
  })

  it('a failed delta falls back to a full load', async () => {
    getGraph
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ nodes: [n('y')], edges: [], communities: [], stats: {}, synced_at: 'c' })
    const out = await refreshProjectGraph('p', ['code'], 500, stale as never)
    expect(out.nodes.map((x) => x.id)).toEqual(['y'])
  })

  it('an abort is not swallowed by the fallback', async () => {
    const ac = new AbortController()
    ac.abort()
    getGraph.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(refreshProjectGraph('p', ['code'], 500, stale as never, ac.signal)).rejects.toBeTruthy()
    expect(getGraph).toHaveBeenCalledTimes(1)
  })
})
