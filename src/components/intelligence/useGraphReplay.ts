// ============================================================================
// useGraphReplay — temporal replay scheduler ("watch the graph form itself")
// ============================================================================
//
// Streams historical graph events (GET /projects/:slug/graph/events) into the
// SAME rAF-buffered application pipeline the live WS uses (graphEventApplier),
// at ×1/×10/×100 compressed time.
//
// Isolation from live WS:
//   - replayStateAtom.active is set BEFORE the graph is cleared; useGraphWebSocket
//     drops all live graph events while it is true (no interleaving).
//   - On exit the atoms are cleared and the live graph is refetched (onRestore).
//
// Scheduling is imperative (rAF loop + refs) — the replayStateAtom is only
// synced ~7Hz for the scrubber UI; event application itself never triggers
// per-event React renders (rAF-batched flushes, same as the live pipeline).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSetAtom } from 'jotai'
import {
  intelligenceNodesAtom,
  intelligenceEdgesAtom,
  replayStateAtom,
  initialReplayState,
  REPLAY_SPEEDS,
  type ReplaySpeed,
} from '@/atoms/intelligence'
import { fetchGraphEvents } from '@/services/intelligence'
import { ApiError } from '@/services/api'
import { useToast } from '@/hooks/useToast'
import type { GraphEvent as BackendGraphEvent } from '@/types'
import { createGraphEventApplier, mapBackendEvent, type GraphEventApplier } from './graphEventApplier'

const PAGE_LIMIT = 1000
/** Prefetch the next page when fewer than this many events remain buffered */
const PREFETCH_THRESHOLD = 250
/** Scrubber atom sync interval (wall ms) */
const ATOM_SYNC_INTERVAL = 150

function eventTime(e: BackendGraphEvent): number {
  const t = Date.parse(e.timestamp)
  return Number.isNaN(t) ? 0 : t
}

export interface GraphReplayControls {
  /** Start a replay session (fetches history; 404 → toast + no-op) */
  start: () => Promise<void>
  /** Exit replay and restore the live graph */
  exit: () => void
  /** start() when inactive, exit() when active */
  toggle: () => void
  play: () => void
  pause: () => void
  /** Cycle playback speed ×1 → ×10 → ×100 → ×1 */
  cycleSpeed: () => void
  /** Jump to a virtual time (ms epoch). Backward seeks restart the replay and
   *  fast-forward silently to the target; forward seeks fast-forward in place. */
  seek: (targetTime: number) => void
}

export function useGraphReplay(
  projectSlug: string | undefined,
  options: { onRestore?: () => void } = {},
): GraphReplayControls {
  const setNodes = useSetAtom(intelligenceNodesAtom)
  const setEdges = useSetAtom(intelligenceEdgesAtom)
  const setReplay = useSetAtom(replayStateAtom)
  const toast = useToast()

  const onRestoreRef = useRef(options.onRestore)
  onRestoreRef.current = options.onRestore

  // ── Scheduler refs (no React state in the animation path) ────────────────
  const activeRef = useRef(false)
  const playingRef = useRef(false)
  const speedRef = useRef<ReplaySpeed>(initialReplayState.speed)
  const virtualTimeRef = useRef(0)
  const startTimeRef = useRef(0)
  const endTimeRef = useRef(0)
  const lastTickRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastAtomSyncRef = useRef(0)

  // ── Event buffer (all fetched pages, chronologically ascending) ──────────
  const eventsRef = useRef<BackendGraphEvent[]>([])
  const appliedIndexRef = useRef(0)
  const cursorRef = useRef<string | null>(null)
  const exhaustedRef = useRef(false)
  const fetchingRef = useRef<Promise<void> | null>(null)
  // Invalidates in-flight seeks/fetches from a previous session or seek
  const sessionTokenRef = useRef(0)

  const applierRef = useRef<GraphEventApplier | null>(null)
  const getApplier = useCallback((): GraphEventApplier => {
    if (!applierRef.current) {
      applierRef.current = createGraphEventApplier({ setNodes, setEdges })
    }
    return applierRef.current
  }, [setNodes, setEdges])

  // ── Atom sync (throttled — scrubber UI only) ─────────────────────────────
  const syncAtom = useCallback((force = false) => {
    const now = performance.now()
    if (!force && now - lastAtomSyncRef.current < ATOM_SYNC_INTERVAL) return
    lastAtomSyncRef.current = now
    setReplay({
      active: activeRef.current,
      playing: playingRef.current,
      speed: speedRef.current,
      currentTime: virtualTimeRef.current,
      startTime: startTimeRef.current,
      endTime: endTimeRef.current,
    })
  }, [setReplay])

  // ── Pagination ────────────────────────────────────────────────────────────
  const fetchNextPage = useCallback((): Promise<void> => {
    if (exhaustedRef.current) return Promise.resolve()
    if (fetchingRef.current) return fetchingRef.current
    if (!projectSlug) return Promise.resolve()

    const token = sessionTokenRef.current
    const promise = fetchGraphEvents(projectSlug, {
      cursor: cursorRef.current ?? undefined,
      until: new Date(endTimeRef.current).toISOString(),
      limit: PAGE_LIMIT,
    })
      .then((page) => {
        if (token !== sessionTokenRef.current || !activeRef.current) return
        if (page.events.length > 0) {
          eventsRef.current = eventsRef.current.concat(page.events)
        }
        // Defensive termination: stop on missing/repeated cursor or empty page
        if (!page.next_cursor || page.next_cursor === cursorRef.current || page.events.length === 0) {
          exhaustedRef.current = true
        } else {
          cursorRef.current = page.next_cursor
        }
      })
      .catch(() => {
        // Network hiccup mid-replay — stop paginating, replay what we have
        if (token !== sessionTokenRef.current) return
        exhaustedRef.current = true
      })
      .finally(() => {
        if (fetchingRef.current === promise) fetchingRef.current = null
      })
    fetchingRef.current = promise
    return promise
  }, [projectSlug])

  // ── Event application ─────────────────────────────────────────────────────
  const applyUpTo = useCallback((targetTime: number, silent: boolean) => {
    const applier = getApplier()
    const events = eventsRef.current
    let i = appliedIndexRef.current
    while (i < events.length && eventTime(events[i]) <= targetTime) {
      const mapped = mapBackendEvent(events[i])
      // Activation events are live-animation concerns — skip during replay
      if (mapped && mapped.type !== 'graph.activation') {
        applier.apply(mapped, { silent })
      }
      i++
    }
    appliedIndexRef.current = i
  }, [getApplier])

  // ── Playback loop ─────────────────────────────────────────────────────────
  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    rafRef.current = null
    if (!activeRef.current) return

    const now = performance.now()
    const wallDelta = Math.min(now - lastTickRef.current, 1000) // clamp tab-suspend jumps
    lastTickRef.current = now

    if (playingRef.current) {
      let vt = virtualTimeRef.current + wallDelta * speedRef.current

      // Don't run ahead of the buffered history — stall while paginating
      if (!exhaustedRef.current) {
        const events = eventsRef.current
        const lastBuffered = events.length > 0 ? eventTime(events[events.length - 1]) : virtualTimeRef.current
        if (vt > lastBuffered) {
          vt = Math.max(virtualTimeRef.current, lastBuffered)
          void fetchNextPage()
        }
      }

      if (vt >= endTimeRef.current && (exhaustedRef.current || appliedIndexRef.current >= eventsRef.current.length)) {
        vt = endTimeRef.current
        playingRef.current = false // reached the end
      }

      virtualTimeRef.current = vt
      applyUpTo(vt, false)

      // Prefetch ahead of playback
      if (!exhaustedRef.current && eventsRef.current.length - appliedIndexRef.current < PREFETCH_THRESHOLD) {
        void fetchNextPage()
      }

      syncAtom(!playingRef.current)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [applyUpTo, fetchNextPage, syncAtom])

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  // ── Controls ──────────────────────────────────────────────────────────────
  const exit = useCallback(() => {
    if (!activeRef.current) return
    sessionTokenRef.current++
    activeRef.current = false
    playingRef.current = false
    stopLoop()
    applierRef.current?.reset()
    eventsRef.current = []
    appliedIndexRef.current = 0
    cursorRef.current = null
    exhaustedRef.current = false
    setReplay(initialReplayState)
    // Restore the live graph: clear replay-built state, then refetch
    setNodes([])
    setEdges([])
    onRestoreRef.current?.()
  }, [stopLoop, setReplay, setNodes, setEdges])

  const start = useCallback(async () => {
    if (activeRef.current || !projectSlug) return
    sessionTokenRef.current++
    const token = sessionTokenRef.current

    // Mark active FIRST so live WS events are suppressed before we clear
    activeRef.current = true
    playingRef.current = false
    endTimeRef.current = Date.now()
    setReplay({ ...initialReplayState, active: true, speed: speedRef.current })

    let firstPage
    try {
      firstPage = await fetchGraphEvents(projectSlug, {
        until: new Date(endTimeRef.current).toISOString(),
        limit: PAGE_LIMIT,
      })
    } catch (err) {
      if (token === sessionTokenRef.current) {
        activeRef.current = false
        setReplay(initialReplayState)
      }
      if (err instanceof ApiError && err.status === 404) {
        toast.warning('Replay unavailable — the graph events endpoint is not deployed on this backend yet')
      } else {
        toast.error('Failed to load graph history for replay')
      }
      return
    }

    if (token !== sessionTokenRef.current) return // exited while fetching

    if (firstPage.events.length === 0) {
      activeRef.current = false
      setReplay(initialReplayState)
      toast.info('No graph events recorded yet — nothing to replay')
      return
    }

    // Seed the buffer + timeline, clear the graph, start playing
    eventsRef.current = firstPage.events
    appliedIndexRef.current = 0
    cursorRef.current = firstPage.next_cursor
    exhaustedRef.current = !firstPage.next_cursor
    startTimeRef.current = eventTime(firstPage.events[0])
    virtualTimeRef.current = startTimeRef.current

    getApplier().reset()
    setNodes([])
    setEdges([])

    playingRef.current = true
    syncAtom(true)
    startLoop()
  }, [projectSlug, setReplay, setNodes, setEdges, getApplier, syncAtom, startLoop, toast])

  const toggle = useCallback(() => {
    if (activeRef.current) {
      exit()
    } else {
      void start()
    }
  }, [exit, start])

  const play = useCallback(() => {
    if (!activeRef.current) return
    // Replaying from the end — restart from the beginning
    if (virtualTimeRef.current >= endTimeRef.current) {
      virtualTimeRef.current = startTimeRef.current
      appliedIndexRef.current = 0
      getApplier().reset()
      setNodes([])
      setEdges([])
    }
    playingRef.current = true
    lastTickRef.current = performance.now()
    syncAtom(true)
    startLoop()
  }, [getApplier, setNodes, setEdges, syncAtom, startLoop])

  const pause = useCallback(() => {
    if (!activeRef.current) return
    playingRef.current = false
    syncAtom(true)
  }, [syncAtom])

  const cycleSpeed = useCallback(() => {
    const idx = REPLAY_SPEEDS.indexOf(speedRef.current)
    speedRef.current = REPLAY_SPEEDS[(idx + 1) % REPLAY_SPEEDS.length]
    if (activeRef.current) syncAtom(true)
  }, [syncAtom])

  const seek = useCallback((targetTime: number) => {
    if (!activeRef.current) return
    const target = Math.min(Math.max(targetTime, startTimeRef.current), endTimeRef.current)
    const resume = playingRef.current
    playingRef.current = false
    sessionTokenRef.current++
    const token = sessionTokenRef.current

    if (target < virtualTimeRef.current) {
      // Backward seek = restart: clear graph + drop pending, replay from index 0
      getApplier().reset()
      setNodes([])
      setEdges([])
      appliedIndexRef.current = 0
    }

    // Fast-forward silently to the target (paginating as needed), then resume
    const fastForward = async () => {
      for (;;) {
        if (token !== sessionTokenRef.current || !activeRef.current) return
        applyUpTo(target, true)
        const events = eventsRef.current
        const lastBuffered = events.length > 0 ? eventTime(events[events.length - 1]) : -Infinity
        if (exhaustedRef.current || lastBuffered >= target) break
        await fetchNextPage()
      }
      if (token !== sessionTokenRef.current || !activeRef.current) return
      virtualTimeRef.current = target
      playingRef.current = resume && target < endTimeRef.current
      lastTickRef.current = performance.now()
      syncAtom(true)
      startLoop()
    }
    void fastForward()
  }, [getApplier, setNodes, setEdges, applyUpTo, fetchNextPage, syncAtom, startLoop])

  // ── Cleanup — exit replay on unmount / slug change ────────────────────────
  useEffect(() => {
    // Alias the ref containers — the scheduler refs are session-scoped
    // counters/handles (not DOM nodes); we intentionally want the latest
    // values at cleanup time.
    const sessionTokenRef2 = sessionTokenRef
    return () => {
      sessionTokenRef2.current++
      if (activeRef.current) {
        activeRef.current = false
        playingRef.current = false
        setReplay(initialReplayState)
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      applierRef.current?.dispose()
      applierRef.current = null
      eventsRef.current = []
    }
  }, [projectSlug, setReplay])

  return useMemo(
    () => ({ start, exit, toggle, play, pause, cycleSpeed, seek }),
    [start, exit, toggle, play, pause, cycleSpeed, seek],
  )
}
