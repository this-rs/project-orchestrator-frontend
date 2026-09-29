/**
 * Drain a paginated endpoint. For views that need the whole set client-side
 * (grouping, kanban, local filtering) where a single `limit=100` call would
 * silently truncate the list. `maxItems` is a safety valve, not a target.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: { limit: number; offset: number }) => Promise<{ items?: T[]; total: number }>,
  { pageSize = 100, maxItems = 5000 }: { pageSize?: number; maxItems?: number } = {},
): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const items: T[] = []
  let total = 0
  for (;;) {
    const res = await fetchPage({ limit: pageSize, offset: items.length })
    total = res.total
    const got = res.items ?? []
    items.push(...got)
    if (got.length === 0 || items.length >= total || items.length >= maxItems) break
  }
  return { items, total, truncated: items.length < total }
}
