import { useEffect, useRef, useState } from 'react'
import { progressApi, type ProgressKind, type TaskCounts } from '@/services/progress'

const CHUNK = 200

/**
 * Task counters for the rows currently in a list — one batched request per
 * new page of ids, never one per row. Ids already loaded are not refetched;
 * pass `refreshKey` to force a reload (after a status change, a refresh…).
 *
 * Failures are silent: the card simply renders without a progress line.
 */
export function useTaskProgress(kind: ProgressKind, ids: string[], refreshKey?: unknown) {
  const [counts, setCounts] = useState<Record<string, TaskCounts>>({})
  const loaded = useRef<Set<string>>(new Set())
  const lastRefresh = useRef<unknown>(refreshKey)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const idsKey = ids.join(',')

  useEffect(() => {
    if (lastRefresh.current !== refreshKey) {
      lastRefresh.current = refreshKey
      loaded.current = new Set()
    }
    const missing = ids.filter((id) => !loaded.current.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => loaded.current.add(id))
    ;(async () => {
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK)
        try {
          const res = await progressApi.batch(kind, chunk)
          // Results are keyed by id, so merging a late response is always safe.
          if (mounted.current) setCounts((prev) => ({ ...prev, ...res }))
        } catch {
          // Let the next render retry these ids.
          chunk.forEach((id) => loaded.current.delete(id))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, idsKey, refreshKey])

  return counts
}
