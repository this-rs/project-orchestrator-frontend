// ============================================================================
// graphCache — in-memory cache of graph fetch responses (per session)
// ============================================================================
//
// Navigating between graph views (project A ↔ project B ↔ workspace, or a
// project ↔ its workspace) re-mounted the hooks, which cleared the global data
// atoms and re-fetched everything — even data that was loaded a second earlier.
// The user's point: « if I load all projects, I already have them when I look
// at just one ».
//
// This is a small session cache of the RAW API responses, keyed by
// (kind, slug, layers, limit). The hooks check it before hitting the network
// and populate it after. A short TTL bounds staleness (live WebSocket updates
// still apply on top); a `force` flag lets the explicit Refresh bypass it.
//
// It is deliberately per-session and per-tab (a module Map): a full page
// reload starts empty, which is the right scope for "already loaded views".
// ============================================================================

/** Marks a single cached response as still-fresh for this long. */
export const GRAPH_CACHE_TTL_MS = 60_000

export type GraphCacheKind = 'project' | 'workspace'

/** Opaque payload — the raw response of getGraph / getWorkspaceGraph. */
export type CachedGraphResponse = unknown

interface CacheEntry {
  response: CachedGraphResponse
  ts: number
}

const cache = new Map<string, CacheEntry>()

/** Deterministic key: layer order must not matter. */
export function graphCacheKey(
  kind: GraphCacheKind,
  slug: string | undefined,
  layers: string[],
  limit: number,
): string {
  return `${kind}\u0001${slug ?? ''}\u0001${[...layers].sort().join(',')}\u0001${limit}`
}

/** Return a fresh cached response, or null (and evict if stale). */
export function graphCacheGet(key: string, now: number = Date.now()): CachedGraphResponse | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now - entry.ts > GRAPH_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.response
}

/** Store a response under `key`, stamped now. */
export function graphCacheSet(key: string, response: CachedGraphResponse, now: number = Date.now()): void {
  cache.set(key, { response, ts: now })
}

/** Drop everything (tests, or a hard refresh from the UI). */
export function graphCacheClear(): void {
  cache.clear()
}

/** Number of entries — for tests/diagnostics. */
export function graphCacheSize(): number {
  return cache.size
}
