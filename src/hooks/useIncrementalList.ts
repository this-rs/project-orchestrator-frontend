import { useCallback, useMemo, useState } from 'react'

/**
 * Client-side incremental rendering: show the first `pageSize` items, reveal more on demand.
 * Use it when the API returns the whole collection at once (no server pagination) so the DOM
 * never holds thousands of rows. Goes back to the first page whenever `resetKey` changes
 * (search, filter, sort).
 */
export function useIncrementalList<T>(items: readonly T[], pageSize = 50, resetKey: unknown = null) {
  const [state, setState] = useState({ key: resetKey, count: pageSize })
  const count = Object.is(state.key, resetKey) ? state.count : pageSize

  const visible = useMemo(() => items.slice(0, count), [items, count])
  const showMore = useCallback(
    () => setState((s) => ({ key: resetKey, count: (Object.is(s.key, resetKey) ? s.count : pageSize) + pageSize })),
    [resetKey, pageSize],
  )
  return {
    visible,
    total: items.length,
    hasMore: items.length > count,
    remaining: Math.max(0, items.length - count),
    showMore,
  }
}
