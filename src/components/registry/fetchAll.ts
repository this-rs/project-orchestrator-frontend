import type { PaginatedResponse } from '@/types'

/** Backend clamps `limit` to 100 (api/query.rs `validated_limit`). */
const PAGE = 100
/** Safety cap: 10 pages = 1000 items per source. */
const MAX_PAGES = 10

/**
 * Fetch every page of a paginated endpoint. Used by the workspace-wide
 * Skills / Personas views, which merge several per-project lists: the merged
 * list cannot be paginated by a single offset, so each source is loaded in
 * full (previously only the first page of each project was shown).
 */
export async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<PaginatedResponse<T> | T[]>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(PAGE, page * PAGE)
    // Some endpoints (e.g. /personas/global) may return a bare array
    const items = Array.isArray(res) ? res : res.items ?? []
    all.push(...items)
    const total = Array.isArray(res) ? items.length : res.total
    if (items.length < PAGE || all.length >= total) break
  }
  return all
}

/** Keep the first occurrence of each id. */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
}
