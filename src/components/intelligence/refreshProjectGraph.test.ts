import { describe, it, expect, vi, beforeEach } from 'vitest'

const getGraph = vi.fn()
vi.mock('@/services/intelligence', () => ({ intelligenceApi: { getGraph: (...a: unknown[]) => getGraph(...a) } }))

import { FULL_RELOAD_AFTER_MS, progressiveGroups, refreshProjectGraph } from './useIntelligenceGraph'

const n = (id: string) => ({ id, type: 'file', label: id, layer: 'code' })
const NOW = 5_000_000
const stale = {
  nodes: [n('a'), n('b')],
  edges: [{ source: 'a', target: 'b', type: 'IMPORTS', layer: 'code' }],
  communities: [],
  stats: {},
  synced_at: '2026-11-04T10:00:00Z',
  deletions_tracked: true,
  loaded_full_at: NOW - 60_000,
}
const refresh = (s: unknown, signal?: AbortSignal, now = NOW) =>
  refreshProjectGraph('p', ['code'], 500, s as never, signal, now)

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
    const out = await refresh(stale)
    expect(getGraph).toHaveBeenCalledTimes(1)
    expect(getGraph.mock.calls[0][1]).toMatchObject({ since: stale.synced_at, includeDeleted: true })
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.edges).toEqual([])
    expect(out.synced_at).toBe('2026-11-04T10:05:00Z')
  })

  it('a delta keeps the date of the last FULL load: merging does not make a snapshot younger', async () => {
    getGraph.mockResolvedValueOnce({ nodes: [], edges: [], communities: [], stats: {}, synced_at: 'c2', deletions_tracked: true })
    const out = await refresh(stale)
    expect(out.loaded_full_at).toBe(stale.loaded_full_at)
  })

  it('a snapshot older than the bound is reloaded in FULL, even with a valid cursor', async () => {
    getGraph.mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'full' })
    const old = { ...stale, loaded_full_at: NOW - FULL_RELOAD_AFTER_MS - 1 }
    const out = await refresh(old)
    expect(getGraph).toHaveBeenCalledTimes(1)
    expect(getGraph.mock.calls[0][1].since).toBeUndefined()
    expect(out.nodes.map((x) => x.id)).toEqual(['x'])
    expect(out.loaded_full_at).toBe(NOW)
  })

  it('a snapshot with no full-load date (older client state) is reloaded in full', async () => {
    getGraph.mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'full' })
    const { loaded_full_at: _drop, ...undated } = stale
    void _drop
    await refresh(undated)
    expect(getGraph.mock.calls[0][1].since).toBeUndefined()
  })

  it('falls back to a full load when the deletions could not be tracked', async () => {
    getGraph
      .mockResolvedValueOnce({ nodes: [], edges: [], communities: [], stats: {}, deletions_tracked: false })
      .mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'full' })
    const out = await refresh(stale)
    expect(getGraph).toHaveBeenCalledTimes(2)
    expect(out.nodes.map((x) => x.id)).toEqual(['x'])
    expect(out.loaded_full_at).toBe(NOW)
  })

  it('loads in full when there is no cursor yet', async () => {
    getGraph.mockResolvedValueOnce({ nodes: [n('x')], edges: [], communities: [], stats: {}, synced_at: 'c' })
    const out = await refresh(null)
    expect(getGraph).toHaveBeenCalledTimes(1)
    expect(getGraph.mock.calls[0][1]).toMatchObject({ includeDeleted: true })
    expect(getGraph.mock.calls[0][1].since).toBeUndefined()
    expect(out.loaded_full_at).toBe(NOW)
  })

  it('a failed delta falls back to a full load', async () => {
    getGraph
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ nodes: [n('y')], edges: [], communities: [], stats: {}, synced_at: 'c' })
    const out = await refresh(stale)
    expect(out.nodes.map((x) => x.id)).toEqual(['y'])
  })

  it('an abort is not swallowed by the fallback', async () => {
    const ac = new AbortController()
    ac.abort()
    getGraph.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(refresh(stale, ac.signal)).rejects.toBeTruthy()
    expect(getGraph).toHaveBeenCalledTimes(1)
  })
})

describe('progressiveGroups — the groups a refresh must reload, as the initial load did', () => {
  it('splits the code/fabric core from the rest when both are visible', () => {
    expect(progressiveGroups(['code', 'knowledge', 'fabric', 'neural'])).toEqual([
      ['code', 'fabric'],
      ['knowledge', 'neural'],
    ])
  })

  it('is one group when only one side is visible', () => {
    expect(progressiveGroups(['code', 'fabric'])).toEqual([['code', 'fabric']])
    expect(progressiveGroups(['knowledge', 'neural'])).toEqual([['knowledge', 'neural']])
  })

  it('keeps an empty selection as one empty group (the loader returns early)', () => {
    expect(progressiveGroups([])).toEqual([[]])
  })
})
