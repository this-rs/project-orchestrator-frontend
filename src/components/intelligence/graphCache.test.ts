import { describe, it, expect, beforeEach } from 'vitest'
import {
  graphCacheKey, graphCacheGet, graphCacheSet, graphCacheClear, graphCacheSize,
  GRAPH_CACHE_TTL_MS,
} from './graphCache'

describe('graphCacheKey', () => {
  it('is independent of layer order', () => {
    expect(graphCacheKey('project', 'p', ['code', 'knowledge'], 5000))
      .toBe(graphCacheKey('project', 'p', ['knowledge', 'code'], 5000))
  })

  it('separates kind, slug, layers and limit', () => {
    const base = graphCacheKey('project', 'p', ['code'], 5000)
    expect(graphCacheKey('workspace', 'p', ['code'], 5000)).not.toBe(base)
    expect(graphCacheKey('project', 'q', ['code'], 5000)).not.toBe(base)
    expect(graphCacheKey('project', 'p', ['code', 'knowledge'], 5000)).not.toBe(base)
    expect(graphCacheKey('project', 'p', ['code'], 1000)).not.toBe(base)
  })
})

describe('graphCache get/set', () => {
  beforeEach(() => graphCacheClear())

  it('returns what was set', () => {
    const key = graphCacheKey('project', 'p', ['code'], 5000)
    graphCacheSet(key, { nodes: [{ id: 'a' }], edges: [] })
    expect(graphCacheGet(key)).toEqual({ nodes: [{ id: 'a' }], edges: [] })
    expect(graphCacheSize()).toBe(1)
  })

  it('misses an unknown key', () => {
    expect(graphCacheGet('nope')).toBeNull()
  })

  it('evicts an entry past its TTL', () => {
    const key = graphCacheKey('project', 'p', ['code'], 5000)
    const t0 = 1_000_000
    graphCacheSet(key, { nodes: [], edges: [] }, t0)
    // Just inside TTL → still there.
    expect(graphCacheGet(key, t0 + GRAPH_CACHE_TTL_MS - 1)).not.toBeNull()
    // Just past TTL → evicted.
    expect(graphCacheGet(key, t0 + GRAPH_CACHE_TTL_MS + 1)).toBeNull()
    expect(graphCacheSize()).toBe(0)
  })

  it('clear empties everything', () => {
    graphCacheSet(graphCacheKey('project', 'a', ['code'], 1), {})
    graphCacheSet(graphCacheKey('workspace', 'b', ['code'], 1), {})
    expect(graphCacheSize()).toBe(2)
    graphCacheClear()
    expect(graphCacheSize()).toBe(0)
  })
})
