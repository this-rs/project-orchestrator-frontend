import { useCallback, useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { attentionCountAtom } from '@/atoms/attentionCount'
import { buildBands } from '@/components/today/bands'
import { attentionApi } from '@/services/attention'
import type { CrudEvent } from '@/types'
import { ATTENTION_DEBOUNCE_MS, isAttentionChanged } from './useAttention'
import { useEventBus } from './useEventBus'

/**
 * Feeds `attentionCountAtom`: the number of band 1 requests ("waiting on you":
 * live waiting + live pending of thread-less sessions, orphans excluded, i.e.
 * exactly `buildBands(...).counts.waiting`, the figure the Today page shows).
 *
 * Mount it ONCE (MainLayout): one `GET /api/attention`, refetched on
 * `attention_changed` with the page's own debounce. No polling, no call per
 * page, no call per badge.
 */
export function useAttentionCountSource() {
  const setState = useSetAtom(attentionCountAtom)
  const seq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const n = ++seq.current
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const data = await attentionApi.fetch(null, ctrl.signal)
      if (ctrl.signal.aborted || n !== seq.current) return
      setState({ status: 'ready', count: buildBands(data).counts.waiting })
    } catch {
      if (ctrl.signal.aborted || n !== seq.current) return
      setState({ status: 'error', count: null })
    }
  }, [setState])

  useEffect(() => {
    void refresh()
    return () => {
      abortRef.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [refresh])

  const onEvent = useCallback(
    (e: CrudEvent) => {
      if (!isAttentionChanged(e)) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void refresh()
      }, ATTENTION_DEBOUNCE_MS)
    },
    [refresh],
  )
  useEventBus(onEvent)
}

/** The shared count, or null when unknown (loading / source error): show nothing then. */
export function useAttentionCount(): number | null {
  return useAtomValue(attentionCountAtom).count
}
