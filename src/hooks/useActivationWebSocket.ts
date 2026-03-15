// ============================================================================
// useActivationWebSocket — lightweight EventBus subscriber for graph.activation
// ============================================================================
//
// Unlike the full useGraphWebSocket (which manages node/edge CRUD on the
// intelligence graph atoms), this hook only subscribes to graph.activation
// events and updates the global activationStateAtom.
//
// Use this in pages that render a 3D graph via UnifiedGraphSection but do NOT
// have the full IntelligenceGraphPage (e.g. PlanDetailPage, MilestoneDetailPage,
// TaskDetailPage). The activation visuals are then applied by useActivationSync
// inside IntelligenceGraph3D.
//
// Events are received via the shared `/ws/events` WebSocket connection
// (managed by EventBusClient). No separate WS connection is created.
//
// If projectSlug is undefined, the hook is a no-op (no subscription).
// ============================================================================

import { useEffect, useRef, useCallback } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { projectSlugToIdAtom } from '@/atoms/projects'
import { getEventBus } from '@/services/eventBus'
import type { GraphEvent as BackendGraphEvent } from '@/types'
import { activationStateAtom, type ActivationState } from '@/components/intelligence/SpreadingActivation'

// ── WS event shape (subset — only activation delta) ─────────────────

interface GraphActivationDelta {
  direct_ids: string[]
  propagated: Array<{ id: string; via: string; score: number }>
  scores: Record<string, number>
  active_edges: string[]
  query: string
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Lightweight EventBus subscriber that only processes `activation` events
 * and updates `activationStateAtom` with 2-phase animation.
 *
 * @param projectSlug  Project slug for filtering. If undefined, no subscription is made.
 */
export function useActivationWebSocket(projectSlug: string | undefined): void {
  const setActivation = useSetAtom(activationStateAtom)
  const activationPhase = useAtomValue(activationStateAtom).phase
  const slugToId = useAtomValue(projectSlugToIdAtom)
  const mountedRef = useRef(true)
  const activationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const activationPhaseRef = useRef<ActivationState['phase']>('idle')
  activationPhaseRef.current = activationPhase

  const handleActivation = useCallback(
    (delta: GraphActivationDelta) => {
      if (!mountedRef.current) return

      // Skip if a local animation is already in progress (e.g. from
      // SpreadingActivation REST call) to avoid interrupting the stagger
      const currentPhase = activationPhaseRef.current
      if (currentPhase === 'searching' || currentPhase === 'direct' || currentPhase === 'propagating') {
        return
      }

      // Clear previous WS-driven animation timers
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
    [setActivation],
  )

  // Subscribe to EventBus graph events (replaces direct WS connection)
  useEffect(() => {
    if (!projectSlug) return

    mountedRef.current = true

    // Resolve slug → project_id for filtering
    const projectId = slugToId.get(projectSlug)

    const unsubGraph = getEventBus().onGraph((raw: BackendGraphEvent) => {
      if (!mountedRef.current) return
      // Only process activation events
      if (raw.type !== 'activation') return
      // Filter by project
      if (projectId && raw.project_id !== projectId) return
      // Extract delta
      const delta = raw.delta as GraphActivationDelta | null
      if (delta) {
        handleActivation(delta)
      }
    })

    return () => {
      mountedRef.current = false
      unsubGraph()
      activationTimersRef.current.forEach(clearTimeout)
      activationTimersRef.current = []
    }
  }, [projectSlug, slugToId, handleActivation])
}
