import { useCallback, useEffect, useRef, useState } from 'react'
import { liveAgentsApi } from '@/services/liveAgents'
import type { CrudEvent } from '@/types'
import type { LiveAgentsResponse } from '@/types/liveAgents'
import { isAttentionChanged } from './useAttention'
import { useEventBus } from './useEventBus'

/** How often the list is re-read while the tab is visible. */
export const LIVE_AGENTS_POLL_MS = 5000

export interface LiveAgentsState {
  status: 'loading' | 'ready' | 'error'
  data: LiveAgentsResponse | null
  /** The last refresh failed: `data` (if any) may be stale. */
  stale: boolean
  refresh: () => void
}

/**
 * The agents running now.
 *
 * Re-read on a timer, because a session starting or finishing a turn is not an
 * event the cockpit relays; and at once on `attention_changed` (a request
 * appeared or was answered). The timer stops while the tab is hidden and
 * catches up when it comes back, so a background tab costs nothing.
 *
 * A failed refresh keeps the previous list and flags it `stale`: an empty
 * screen would claim nobody is running, which is the one thing it must never
 * say by mistake.
 */
export function useLiveAgents(): LiveAgentsState {
  const [data, setData] = useState<LiveAgentsResponse | null>(null)
  const [status, setStatus] = useState<LiveAgentsState['status']>('loading')
  const [stale, setStale] = useState(false)
  const inflight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    try {
      const next = await liveAgentsApi.list(controller.signal)
      if (controller.signal.aborted) return
      setData(next)
      setStatus('ready')
      setStale(false)
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
      setStale(true)
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'))
    }
  }, [])

  useEffect(() => {
    void load()
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = setInterval(tick, LIVE_AGENTS_POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      inflight.current?.abort()
    }
  }, [load])

  useEventBus(
    useCallback(
      (e: CrudEvent) => {
        if (isAttentionChanged(e)) void load()
      },
      [load],
    ),
  )

  return { status, data, stale, refresh: () => void load() }
}
