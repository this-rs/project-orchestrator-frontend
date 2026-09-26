/**
 * useNeighborhood — fetches the ego-graph of an entity.
 *
 * - Cache per normalized params (small in-memory LRU shared by every graph),
 *   so toggling depth 1 → 2 → 1 is instant and never refetches.
 * - Aborts the in-flight request as soon as params change (fast relief/depth
 *   tweaks on a phone never pile up requests or apply a stale answer).
 * - Keeps the previous result available (`staleData`) while the next one
 *   loads, so the view dims instead of flashing a skeleton.
 */
import { useEffect, useState } from 'react'
import {
  neighborhoodApi,
  type NeighborhoodParams,
  type NeighborhoodResponse,
} from '@/services/neighborhood'

const CACHE_MAX = 40
const cache = new Map<string, NeighborhoodResponse>()

function cacheGet(key: string): NeighborhoodResponse | undefined {
  const hit = cache.get(key)
  if (hit) {
    // refresh LRU position
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}

function cacheSet(key: string, value: NeighborhoodResponse) {
  cache.set(key, value)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Test helper — clears the shared cache. */
export function clearNeighborhoodCache() {
  cache.clear()
}

/** Stable cache key; layers sorted so order doesn't matter. */
export function neighborhoodKey(p: NeighborhoodParams): string {
  return JSON.stringify({
    entityType: p.entityType,
    entityId: p.entityId,
    depth: p.depth,
    minWeight: Math.round(p.minWeight * 100) / 100,
    limit: p.limit ?? null,
    layers: p.layers ? [...p.layers].sort() : null,
  })
}

function paramsFromKey(key: string): NeighborhoodParams {
  const o = JSON.parse(key) as {
    entityType: string
    entityId: string
    depth: NeighborhoodParams['depth']
    minWeight: number
    limit: number | null
    layers: NeighborhoodParams['layers'] | null
  }
  return {
    entityType: o.entityType,
    entityId: o.entityId,
    depth: o.depth,
    minWeight: o.minWeight,
    limit: o.limit ?? undefined,
    layers: o.layers ?? undefined,
  }
}

interface FetchState {
  key: string | null
  data?: NeighborhoodResponse
  error?: Error
}

export interface UseNeighborhoodResult {
  /** Data for the current params (undefined while loading / on error). */
  data: NeighborhoodResponse | undefined
  /** Last successfully loaded data, for any params — shown dimmed while loading. */
  staleData: NeighborhoodResponse | undefined
  loading: boolean
  error: Error | undefined
  retry: () => void
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

export function useNeighborhood(params: NeighborhoodParams | null): UseNeighborhoodResult {
  const key = params && params.entityId ? neighborhoodKey(params) : null
  const [state, setState] = useState<FetchState>({ key: null })
  const [nonce, setNonce] = useState(0)

  const cached = key ? cacheGet(key) : undefined

  useEffect(() => {
    if (!key || cache.has(key)) return
    const ctrl = new AbortController()
    neighborhoodApi.get(paramsFromKey(key), ctrl.signal).then(
      (data) => {
        if (ctrl.signal.aborted) return
        cacheSet(key, data)
        setState({ key, data })
      },
      (err: unknown) => {
        if (ctrl.signal.aborted || isAbort(err)) return
        setState((s) => ({
          key,
          data: s.data,
          error: err instanceof Error ? err : new Error(String(err)),
        }))
      }
    )
    return () => ctrl.abort()
  }, [key, nonce])

  const retry = () => {
    setState((s) => ({ key: null, data: s.data }))
    setNonce((n) => n + 1)
  }

  const error = state.key === key ? state.error : undefined
  const data = cached ?? (state.key === key && !state.error ? state.data : undefined)
  return {
    data,
    staleData: data ?? state.data,
    loading: key !== null && !data && !error,
    error,
    retry,
  }
}
