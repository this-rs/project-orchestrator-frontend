/**
 * `useActivityStream` — the Activity Hub's data layer.
 *
 * Three sources, one state:
 * 1. the **snapshot** (`GET /api/activity/snapshot`) paints the first frame and
 *    is re-read whenever the truth may have moved;
 * 2. the **live feed** (`/ws/activity`) says *when* something happened and feeds
 *    the log;
 * 3. the **sequence cursor** links them: the snapshot says where the feed starts,
 *    and every reconnect asks for the gap since the last event actually seen.
 *
 * Why the hook refreshes the snapshot on events instead of patching the cards
 * event by event: a card's numbers (completed/total, current wave, cost) are
 * *derived server state*, and recomputing them in the browser from a partial
 * event log would be a second, subtly different implementation — the one that
 * drifts. The feed is used for what it is good at (telling us something moved,
 * right now) and the snapshot for what it is good at (being true). Refreshes are
 * debounced, so a burst of events costs one request.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchActivitySnapshot } from '@/services/activityApi'
import { ActivityStreamClient, type ActivityConnectionStatus } from '@/services/activityWs'
import { apiErrorMessage } from '@/services/api'
import type { ActivityCategory, ActivityEvent, ActivitySnapshot } from '@/types/activity'

/** How many log lines the hook keeps in memory. */
export const ACTIVITY_LOG_LIMIT = 500
/** Minimum delay between two snapshot refreshes triggered by events. */
const REFRESH_DEBOUNCE_MS = 3000

export interface UseActivityStreamOptions {
  projectId?: string
  workspaceSlug?: string
  /** Categories to subscribe to. Empty = all. */
  categories?: ActivityCategory[]
  /** Statuses to subscribe to. Empty = all. */
  statuses?: string[]
  /** `false` keeps the hook inert (e.g. while the page is not visible). */
  enabled?: boolean
}

export interface UseActivityStreamResult {
  snapshot: ActivitySnapshot | null
  /** The live log, newest last, capped at {@link ACTIVITY_LOG_LIMIT}. */
  events: ActivityEvent[]
  status: ActivityConnectionStatus
  loading: boolean
  error: string | null
  /** Events lost since the last snapshot (`lag_dropped`), for an honest banner. */
  gap: number
  /**
   * `entity_id` → sequence number of its last event. A card compares it with
   * the value it rendered before to know it just moved (pulse animation).
   */
  lastEventSeqByEntity: Record<string, number>
  /** Re-read the snapshot now (also used after a gap). */
  refresh: () => void
}

export function useActivityStream({
  projectId,
  workspaceSlug,
  categories = [],
  statuses = [],
  enabled = true,
}: UseActivityStreamOptions = {}): UseActivityStreamResult {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null)
  /** True once a snapshot of the CURRENT scope has landed (see the socket effect). */
  const [seeded, setSeeded] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [status, setStatus] = useState<ActivityConnectionStatus>('disconnected')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gap, setGap] = useState(0)
  const [lastEventSeqByEntity, setLastEventSeqByEntity] = useState<Record<string, number>>({})

  const clientRef = useRef<ActivityStreamClient | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)

  // Object identity of the filters must not drive reconnects: compare contents.
  const categoriesKey = categories.join(',')
  const statusesKey = statuses.join(',')

  /**
   * Cursor of the last snapshot, kept in a ref so the socket effect can read it
   * without depending on the snapshot object: a refresh must not tear the socket
   * down and rebuild it (the cursor is pushed through `setCursor` instead).
   */
  const snapshotSeqRef = useRef<number | null>(null)

  const loadSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchActivitySnapshot({ projectId, workspaceSlug }, signal)
        if (!aliveRef.current || signal?.aborted) return
        setSnapshot(next)
        setError(null)
        snapshotSeqRef.current = next.last_event_seq
        setSeeded(true)
        clientRef.current?.setCursor(next.last_event_seq)
      } catch (err) {
        if (!aliveRef.current || (err as Error)?.name === 'AbortError') return
        setError(apiErrorMessage(err))
      } finally {
        if (aliveRef.current && !signal?.aborted) setLoading(false)
      }
    },
    [projectId, workspaceSlug],
  )

  /** Re-read the truth, at most once per {@link REFRESH_DEBOUNCE_MS}. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      void loadSnapshot()
    }, REFRESH_DEBOUNCE_MS)
  }, [loadSnapshot])

  const refresh = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
    void loadSnapshot()
  }, [loadSnapshot])

  // ── Snapshot, and the socket that reports what changed since ────────────
  useEffect(() => {
    aliveRef.current = true
    if (!enabled) {
      setLoading(false)
      return () => {
        aliveRef.current = false
      }
    }

    const controller = new AbortController()
    setLoading(true)
    // A new scope invalidates the old cursor: the socket must not be rebuilt on
    // a sequence number that belonged to another project's stream.
    setSeeded(false)
    void loadSnapshot(controller.signal)

    return () => {
      aliveRef.current = false
      controller.abort()
    }
  }, [enabled, loadSnapshot])

  useEffect(() => {
    if (!enabled) return
    // Wait for the first snapshot: the feed must start from its cursor, not
    // from zero (which would replay the whole server ring on every mount).
    if (!seeded) return

    const client = new ActivityStreamClient(
      {
        projectId,
        workspaceSlug,
        categories: categoriesKey ? (categoriesKey.split(',') as ActivityCategory[]) : [],
        statuses: statusesKey ? statusesKey.split(',') : [],
      },
      {
        onStatus: setStatus,
        onReady: (_seq, replayed) => {
          // A replay means the server still had the gap: nothing was lost.
          if (replayed > 0) setGap(0)
        },
        onGap: (skipped) => {
          setGap((current) => current + skipped)
          // The log has a hole and the cards may be stale: re-read the truth.
          refresh()
        },
        onEvent: (event) => {
          setEvents((current) => {
            const next = current.length >= ACTIVITY_LOG_LIMIT
              ? [...current.slice(current.length - ACTIVITY_LOG_LIMIT + 1), event]
              : [...current, event]
            return next
          })
          setLastEventSeqByEntity((current) => ({
            ...current,
            [event.entity_id]: event.seq,
          }))
          scheduleRefresh()
        },
      },
      snapshotSeqRef.current ?? 0,
    )
    clientRef.current = client
    void client.connect()

    return () => {
      clientRef.current = null
      client.disconnect()
    }
  }, [
    enabled,
    // Only re-create the socket when the scope or the filters change — never on
    // every snapshot (the cursor is pushed through `setCursor` instead).
    projectId,
    workspaceSlug,
    categoriesKey,
    statusesKey,
    // `seeded` flips once, when the first snapshot has landed: the feed must
    // start from its cursor, not from zero.
    seeded,
    refresh,
    scheduleRefresh,
  ])

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  return useMemo(
    () => ({
      snapshot,
      events,
      status,
      loading,
      error,
      gap,
      lastEventSeqByEntity,
      refresh,
    }),
    [snapshot, events, status, loading, error, gap, lastEventSeqByEntity, refresh],
  )
}
