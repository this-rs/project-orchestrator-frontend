import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from '@/services/api'
import {
  splitBudget, limitCandidates, fetchWithLimitEscalation, mergeById, replaceLayerById, streamLayers,
} from './graphLayerStream'
import { graphCacheClear, graphCacheSize } from './graphCache'

beforeEach(() => {
  graphCacheClear()
  vi.restoreAllMocks()
})

describe('splitBudget', () => {
  it('6 layers on a 20 000 budget: sum is exactly the budget', () => {
    const shares = splitBudget(20_000, 6)
    expect(shares).toHaveLength(6)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(20_000)
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
  })
  it('never exceeds the budget, whatever the count', () => {
    for (const total of [0, 1, 5, 199, 5000, 20000]) {
      for (const n of [1, 2, 3, 6, 8]) {
        expect(splitBudget(total, n).reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
  it('no layers → no shares', () => expect(splitBudget(100, 0)).toEqual([]))
})

describe('limit escalation', () => {
  it('candidates are the share, then smaller ladder rungs, descending', () => {
    expect(limitCandidates(3334)).toEqual([3334, 2000, 1000, 500, 200])
    expect(limitCandidates(50_000)).toEqual([50_000, 20_000, 5_000, 2_000, 1_000, 500, 200])
  })

  it('retries on 422 then 400 and stops at the first success, warning each refusal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const asked: number[] = []
    const out = await fetchWithLimitEscalation(async (lim) => {
      asked.push(lim)
      if (lim > 2000) throw new ApiError(lim > 3000 ? 422 : 400, 'too big')
      return 'ok'
    }, 4000)
    expect(asked).toEqual([4000, 2000])
    expect(out).toEqual({ data: 'ok', limit: 2000 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('limit=4000')
  })

  it('does not retry on other errors', async () => {
    const asked: number[] = []
    await expect(fetchWithLimitEscalation(async (lim) => {
      asked.push(lim)
      throw new ApiError(500, 'boom')
    }, 4000)).rejects.toThrow('boom')
    expect(asked).toEqual([4000])
  })

  it('throws the last refusal when every rung is refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(fetchWithLimitEscalation(async () => { throw new ApiError(400, 'no') }, 700)).rejects.toThrow('no')
  })
})

describe('merge by id', () => {
  it('replaces a known id in place, appends a new one', () => {
    const out = mergeById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }])
    expect(out).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 2 }])
  })
  it('dedupes the incoming list when the target is empty', () => {
    expect(mergeById([], [{ id: 'a', v: 1 }, { id: 'a', v: 2 }])).toEqual([{ id: 'a', v: 2 }])
  })
  it('a layer refresh drops that layer\'s stale nodes only', () => {
    const prev = [{ id: 'c1', layer: 'code' }, { id: 'c2', layer: 'code' }, { id: 'k1', layer: 'knowledge' }]
    const out = replaceLayerById(prev, [{ id: 'c1', layer: 'code' }, { id: 'c3', layer: 'code' }], 'code', (n) => n.layer)
    expect(out.map((n) => n.id).sort()).toEqual(['c1', 'c3', 'k1'])
  })
})

describe('streamLayers', () => {
  const resp = (layer: string) => ({ nodes: [{ id: `${layer}-1`, layer }] })

  it('one request per layer, sum of limits ≤ budget, results arrive as they land', async () => {
    const layers = ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills']
    const asked: Record<string, number> = {}
    const resolvers: Record<string, () => void> = {}
    const landed: string[] = []
    const p = streamLayers({
      kind: 'project', slug: 'p', layers, limit: 20_000,
      fetchLayer: (layer, lim) => new Promise((resolve) => {
        asked[layer] = lim
        resolvers[layer] = () => resolve(resp(layer))
      }),
      onLayer: (layer) => landed.push(layer),
    })
    await Promise.resolve()
    expect(Object.keys(asked).sort()).toEqual([...layers].sort()) // all in flight together
    expect(Object.values(asked).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20_000)
    resolvers.skills(); await Promise.resolve(); await Promise.resolve()
    expect(landed).toEqual(['skills']) // first to answer is first shown
    layers.filter((l) => l !== 'skills').forEach((l) => resolvers[l]())
    const res = await p
    expect(res.loaded).toHaveLength(6)
    expect(res.errors).toEqual({})
  })

  it('shares one budget across groups via budgetLayers', async () => {
    const asked: number[] = []
    const all = ['code', 'fabric', 'neural', 'skills']
    const run = (layers: string[]) => streamLayers({
      kind: 'project', slug: 'p', layers, budgetLayers: all, limit: 8000,
      fetchLayer: async (_l, lim) => { asked.push(lim); return {} },
      onLayer: () => {},
    })
    await Promise.all([run(['code', 'fabric']), run(['neural', 'skills'])])
    expect(asked).toHaveLength(4)
    expect(asked.reduce((a, b) => a + b, 0)).toBe(8000)
  })

  it('caches per layer: second call hits no network, one layer failing is isolated', async () => {
    const fetchLayer = vi.fn(async (layer: string) => {
      if (layer === 'pm') throw new ApiError(500, 'pm down')
      return resp(layer)
    })
    const onLayer = vi.fn()
    const first = await streamLayers({ kind: 'project', slug: 'p', layers: ['code', 'pm'], limit: 4000, fetchLayer, onLayer })
    expect(first.loaded).toEqual(['code'])
    expect(Object.keys(first.errors)).toEqual(['pm'])
    expect(graphCacheSize()).toBe(1) // only the layer that succeeded
    fetchLayer.mockClear()
    const second = await streamLayers({ kind: 'project', slug: 'p', layers: ['code'], budgetLayers: ['code', 'pm'], limit: 4000, fetchLayer, onLayer })
    expect(fetchLayer).not.toHaveBeenCalled()
    expect(second.loaded).toEqual(['code'])
    const forced = await streamLayers({ kind: 'project', slug: 'p', layers: ['code'], budgetLayers: ['code', 'pm'], limit: 4000, force: true, fetchLayer, onLayer })
    expect(fetchLayer).toHaveBeenCalledTimes(1)
    expect(forced.loaded).toEqual(['code'])
  })

  it('an aborted load applies nothing and caches nothing', async () => {
    const ctrl = new AbortController()
    const onLayer = vi.fn()
    const res = await streamLayers({
      kind: 'project', slug: 'p', layers: ['code', 'pm'], limit: 4000, signal: ctrl.signal,
      fetchLayer: async (layer) => { ctrl.abort(); return resp(layer) },
      onLayer,
    })
    expect(onLayer).not.toHaveBeenCalled()
    expect(res.loaded).toEqual([])
    expect(graphCacheSize()).toBe(0)
  })

  it('escalates per layer through fetchLayer refusals', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const asked: number[] = []
    const res = await streamLayers({
      kind: 'project', slug: 'p', layers: ['code'], limit: 30_000,
      fetchLayer: async (_l, lim) => { asked.push(lim); if (lim > 5000) throw new ApiError(422, 'x'); return {} },
      onLayer: () => {},
    })
    expect(asked).toEqual([30_000, 20_000, 5_000])
    expect(res.limits.code).toBe(5_000)
  })
})
