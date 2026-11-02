// ============================================================================
// graphLayerStream — one request PER LAYER, merged as each one arrives
// ============================================================================
//
// The graph view used to ask for every layer in a single request and wait for
// the whole JSON before showing anything: on 20 000 nodes, a frozen screen.
// Here each layer is its own request, all in flight together; every response is
// handed to `onLayer` the moment it is parsed so the caller can merge it into
// the atoms (one paint per layer). Pure of React: the hooks supply the callbacks.
//
//  • Budget      — `limit` is a TOTAL; `splitBudget` gives each layer its share,
//                  the shares sum to the budget (never above it).
//  • Escalation  — a 400/422 retries with a smaller `limit` (descending ladder)
//                  and stops at the first success. A smaller value never raises
//                  the sum above the budget.
//  • Cache       — keyed per layer (and per requested share), see graphCache.
//  • Abort       — an aborted load applies nothing: no half-merged state.
// ============================================================================

import { ApiError } from '@/services/api'
import { graphCacheKey, graphCacheGet, graphCacheSet, type GraphCacheKind } from './graphCache'

/** Fallback limits tried, in decreasing order, after the layer's own share. */
export const LIMIT_LADDER = [1_000_000, 100_000, 20_000, 5_000, 2_000, 1_000, 500, 200] as const

/** Split a total node budget over `count` layers. Shares sum to `total` exactly. */
export function splitBudget(total: number, count: number): number[] {
  if (count <= 0) return []
  const t = Math.max(0, Math.floor(total))
  const base = Math.floor(t / count)
  const extra = t - base * count
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Limits to try for a layer: its share first, then each smaller ladder rung. */
export function limitCandidates(share: number): number[] {
  const s = Math.max(1, Math.floor(share))
  return [s, ...LIMIT_LADDER.filter((v) => v < s)]
}

const isRefusal = (err: unknown) => err instanceof ApiError && (err.status === 400 || err.status === 422)

/** Ask for `share` nodes; on 400/422 retry smaller, stop at the first success. */
export async function fetchWithLimitEscalation<T>(
  request: (limit: number) => Promise<T>,
  share: number,
  label = '',
): Promise<{ data: T; limit: number }> {
  const candidates = limitCandidates(share)
  let lastErr: unknown
  for (const limit of candidates) {
    try {
      return { data: await request(limit), limit }
    } catch (err) {
      if (!isRefusal(err)) throw err
      console.warn(`[graph] limit=${limit} refused by the backend (${(err as ApiError).status})${label ? ` for ${label}` : ''}`)
      lastErr = err
    }
  }
  throw lastErr
}

/** Merge by `id`: a known id is replaced in place, a new one is appended. */
export function mergeById<T extends { id: string | number }>(prev: readonly T[], incoming: readonly T[]): T[] {
  if (prev.length === 0) return dedupe(incoming)
  const index = new Map<string | number, number>()
  const out = prev.slice()
  out.forEach((item, i) => index.set(item.id, i))
  for (const item of incoming) {
    const at = index.get(item.id)
    if (at === undefined) {
      index.set(item.id, out.length)
      out.push(item)
    } else {
      out[at] = item
    }
  }
  return out
}

function dedupe<T extends { id: string | number }>(items: readonly T[]): T[] {
  return Array.from(new Map(items.map((i) => [i.id, i])).values())
}

/**
 * Refresh one layer inside the atoms: drop what that layer held before (so a
 * deleted node disappears), then merge the new items by id.
 */
export function replaceLayerById<T extends { id: string | number }>(
  prev: readonly T[],
  incoming: readonly T[],
  layer: string,
  layerOf: (item: T) => string | undefined,
): T[] {
  return mergeById(prev.filter((i) => layerOf(i) !== layer), incoming)
}

export interface StreamLayersOptions<R> {
  kind: GraphCacheKind
  slug: string
  /** Layers to request now. */
  layers: string[]
  /** Every layer sharing the budget (>= layers). Defaults to `layers`. */
  budgetLayers?: string[]
  /** Total node budget (graphNodeLimitAtom). */
  limit: number
  /** One request for ONE layer with `limit` nodes. */
  fetchLayer: (layer: string, limit: number, signal?: AbortSignal) => Promise<R>
  signal?: AbortSignal
  /** Bypass the cache (explicit refresh). */
  force?: boolean
  /** Called as each layer lands; never called once `signal` is aborted. */
  onLayer: (layer: string, data: R, info: { fromCache: boolean; limit: number }) => void
  /** Called when a layer's request(s) are about to go to the network. */
  onLayerStart?: (layer: string) => void
}

export interface StreamLayersResult {
  /** Layers that landed. */
  loaded: string[]
  /** First error per failed layer (aborts excluded). */
  errors: Record<string, unknown>
  /** The limit actually used per loaded layer. */
  limits: Record<string, number>
}

/** Fetch every layer in parallel, delivering each as soon as it arrives. */
export async function streamLayers<R>(opts: StreamLayersOptions<R>): Promise<StreamLayersResult> {
  const { kind, slug, layers, limit, fetchLayer, signal, force = false, onLayer, onLayerStart } = opts
  const budgetLayers = opts.budgetLayers ?? layers
  const shares = splitBudget(limit, budgetLayers.length)
  const shareOf = (layer: string) => shares[Math.max(0, budgetLayers.indexOf(layer))] ?? 0
  const result: StreamLayersResult = { loaded: [], errors: {}, limits: {} }

  await Promise.all(
    layers.map(async (layer) => {
      const share = shareOf(layer)
      if (share <= 0) return
      const key = graphCacheKey(kind, slug, [layer], share)
      try {
        const cached = force ? null : (graphCacheGet(key) as R | null)
        if (cached) {
          if (signal?.aborted) return
          onLayer(layer, cached, { fromCache: true, limit: share })
          result.loaded.push(layer)
          result.limits[layer] = share
          return
        }
        onLayerStart?.(layer)
        const { data, limit: used } = await fetchWithLimitEscalation(
          (lim) => fetchLayer(layer, lim, signal),
          share,
          layer,
        )
        if (signal?.aborted) return
        graphCacheSet(key, data)
        onLayer(layer, data, { fromCache: false, limit: used })
        result.loaded.push(layer)
        result.limits[layer] = used
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        result.errors[layer] = err
      }
    }),
  )
  return result
}
