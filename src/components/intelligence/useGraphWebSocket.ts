import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { intelligenceNodesAtom, intelligenceEdgesAtom, replayActiveAtom } from '@/atoms/intelligence'
import { projectSlugToIdAtom } from '@/atoms/projects'
import { getEventBus } from '@/services/eventBus'
import type { GraphEvent as BackendGraphEvent } from '@/types'
import { activationStateAtom, type ActivationState } from './SpreadingActivation'
import {
  createGraphEventApplier,
  mapBackendEvent,
  type FrontendGraphEvent,
} from './graphEventApplier'

// ============================================================================
// HOOK
// ============================================================================
//
// Event mapping + structural application (node/edge CRUD, reinforcement,
// community) live in graphEventApplier.ts — shared with useGraphReplay.
// This hook adds: EventBus subscription, project filtering, activation
// animation orchestration, and replay suppression.
// ============================================================================

export interface GraphWsState {
  /** Whether the EventBus WS is connected */
  connected: boolean
  /** Timestamp of last received event (for Live pulse) */
  lastEventAt: number | null
  /** Timestamp of last activation/reinforcement event (for "thinking" pulse) */
  lastNeuralEventAt: number | null
}

/**
 * Hook that subscribes to graph events from the EventBus and applies
 * real-time updates to the intelligence graph atoms.
 *
 * Events are received via the shared `/ws/events` WebSocket connection
 * (managed by EventBusClient) and buffered via requestAnimationFrame
 * to avoid excessive re-renders.
 *
 * While a temporal replay is active (replayStateAtom.active), live graph
 * events are suppressed entirely so historical and live streams never
 * interleave. The graph is refetched when replay exits.
 */
export function useGraphWebSocket(projectSlug: string | undefined): GraphWsState {
  const setNodes = useSetAtom(intelligenceNodesAtom)
  const setEdges = useSetAtom(intelligenceEdgesAtom)
  const setActivation = useSetAtom(activationStateAtom)
  const activationPhase = useAtomValue(activationStateAtom).phase
  const slugToId = useAtomValue(projectSlugToIdAtom)
  // Derived boolean — only re-renders on active flip, not on 10Hz scrubber updates
  const replayActive = useAtomValue(replayActiveAtom)
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const [lastNeuralEventAt, setLastNeuralEventAt] = useState<number | null>(null)

  const mountedRef = useRef(true)
  const activationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // Track current activation phase in a ref so the memoized callback sees latest value
  const activationPhaseRef = useRef<ActivationState['phase']>('idle')
  activationPhaseRef.current = activationPhase
  // Replay suppression guard — checked inside the EventBus callback
  const replayActiveRef = useRef(replayActive)
  useEffect(() => {
    replayActiveRef.current = replayActive
  }, [replayActive])

  // Shared structural-event applier (rAF-buffered flush pipeline)
  const applier = useMemo(
    () => createGraphEventApplier({ setNodes, setEdges }),
    [setNodes, setEdges],
  )
  useEffect(() => () => applier.dispose(), [applier])

  // Process a single mapped frontend graph event
  const handleEvent = useCallback(
    (event: FrontendGraphEvent) => {
      if (!mountedRef.current) return
      setLastEventAt(Date.now())

      // Observatory "thinking" signal — neural activity (activation/reinforcement)
      if (event.type === 'graph.activation' || event.type === 'graph.reinforcement') {
        setLastNeuralEventAt(Date.now())
      }

      // Structural events → shared applier (node/edge CRUD, reinforcement, community)
      if (event.type !== 'graph.activation') {
        applier.apply(event)
        return
      }

      // ── Activation events — drive the SpreadingActivation animation ──
      // If a local animation is already in progress (triggered by REST in
      // SpreadingActivation.tsx), skip the WS echo to avoid interrupting
      // the staggered animation. Only apply when phase is 'idle' or 'done'.
      const currentPhase = activationPhaseRef.current
      if (currentPhase === 'searching' || currentPhase === 'direct' || currentPhase === 'propagating') {
        return
      }

      const delta = event.delta
      if (!delta) return

      // ── Streamed phased events (backend sends phase field) ──
      if (delta.phase) {
        switch (delta.phase) {
          case 'direct': {
            // Phase 1: Light up direct matches immediately
            // Clear any previous WS-driven animation timers
            activationTimersRef.current.forEach(clearTimeout)
            activationTimersRef.current = []

            const directIds = new Set(delta.direct_ids)
            const scores = new Map<string, number>()
            for (const [id, score] of Object.entries(delta.scores)) {
              scores.set(id, score)
            }

            setActivation({
              directIds,
              propagatedIds: new Set(),
              scores,
              activeEdges: new Set(),
              phase: 'direct',
            })
            break
          }

          case 'propagating': {
            // Phase 2: MERGE propagated notes into existing state
            setActivation((prev: ActivationState) => {
              const mergedPropagated = new Set(prev.propagatedIds)
              for (const p of delta.propagated) {
                mergedPropagated.add(p.id)
              }

              const mergedScores = new Map(prev.scores)
              for (const [id, score] of Object.entries(delta.scores)) {
                mergedScores.set(id, score)
              }

              const mergedEdges = new Set(prev.activeEdges)
              for (const edgeKey of delta.active_edges) {
                mergedEdges.add(edgeKey)
              }

              return {
                ...prev,
                propagatedIds: mergedPropagated,
                scores: mergedScores,
                activeEdges: mergedEdges,
                phase: 'propagating',
              }
            })
            break
          }

          case 'done': {
            // Phase 3: Signal completion
            setActivation((prev: ActivationState) => ({
              ...prev,
              phase: 'done' as const,
            }))
            break
          }
        }
        return
      }

      // ── Legacy single-event fallback (no phase field) ──
      // Clear any previous WS-driven animation timers
      activationTimersRef.current.forEach(clearTimeout)
      activationTimersRef.current = []

      // Phase 1 (immediate): Light up direct matches
      const directIds = new Set(delta.direct_ids)
      const initialScores = new Map<string, number>()
      for (const id of delta.direct_ids) {
        if (delta.scores[id] !== undefined) {
          initialScores.set(id, delta.scores[id])
        }
      }

      setActivation({
        directIds,
        propagatedIds: new Set(),
        scores: initialScores,
        activeEdges: new Set(),
        phase: 'direct',
      })

      // Phase 2 (staggered): Propagate along synapses in waves
      const sorted = [...delta.propagated].sort((a, b) => b.score - a.score)
      const batchSize = Math.max(1, Math.ceil(sorted.length / 5))
      const delayPerBatch = 200

      let accumulated = new Set<string>()
      const allScores = new Map(initialScores)

      for (let i = 0; i < sorted.length; i += batchSize) {
        const batch = sorted.slice(i, i + batchSize)
        const delay = 400 + (i / batchSize) * delayPerBatch

        const timeout = setTimeout(() => {
          if (!mountedRef.current) return

          batch.forEach((r) => {
            accumulated.add(r.id)
            allScores.set(r.id, r.score)
          })

          // Build active edges from the delta
          const allActivated = new Set([...directIds, ...accumulated])
          const activeEdges = new Set<string>()
          for (const edgeKey of delta.active_edges) {
            const [src, tgt] = edgeKey.split('-')
            if (src && tgt && allActivated.has(src) && allActivated.has(tgt)) {
              activeEdges.add(edgeKey)
            }
          }

          setActivation({
            directIds,
            propagatedIds: new Set(accumulated),
            scores: new Map(allScores),
            activeEdges,
            phase: i + batchSize >= sorted.length ? 'done' : 'propagating',
          })
          accumulated = new Set(accumulated)
        }, delay)

        activationTimersRef.current.push(timeout)
      }

      // If no propagated results, transition to done after direct phase
      if (sorted.length === 0) {
        const timeout = setTimeout(() => {
          if (!mountedRef.current) return
          setActivation((prev: ActivationState) => ({ ...prev, phase: 'done' as const }))
        }, 400)
        activationTimersRef.current.push(timeout)
      }
    },
    [applier, setActivation],
  )

  // Subscribe to EventBus graph events (replaces direct WS connection)
  useEffect(() => {
    if (!projectSlug) return

    mountedRef.current = true

    // Resolve slug → project_id for filtering
    const projectId = slugToId.get(projectSlug)

    const eventBus = getEventBus()

    // Track EventBus connection status
    const unsubStatus = eventBus.onStatus((status) => {
      if (!mountedRef.current) return
      setConnected(status === 'connected')
    })
    // Set initial status
    setConnected(eventBus.status === 'connected')

    // Subscribe to graph events, filter by project, map and dispatch
    const unsubGraph = eventBus.onGraph((raw: BackendGraphEvent) => {
      if (!mountedRef.current) return
      // Temporal replay active — suppress ALL live graph events so the
      // historical stream never interleaves with live mutations. The live
      // graph is restored (refetched) when replay exits.
      if (replayActiveRef.current) return
      // Filter by project_id (skip events from other projects)
      if (projectId && raw.project_id !== projectId) return
      const mapped = mapBackendEvent(raw)
      if (mapped) {
        handleEvent(mapped)
      }
    })

    return () => {
      mountedRef.current = false
      unsubStatus()
      unsubGraph()
      activationTimersRef.current.forEach(clearTimeout)
      activationTimersRef.current = []
    }
  }, [projectSlug, slugToId, handleEvent])

  return { connected, lastEventAt, lastNeuralEventAt }
}
