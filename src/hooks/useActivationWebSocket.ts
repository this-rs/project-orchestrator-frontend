// ============================================================================
// useActivationWebSocket — lightweight WS that ONLY handles graph.activation
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
// If projectSlug is undefined, the hook is a no-op (no WS connection).
// Disconnects are handled gracefully — no errors, just silent reconnect.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { createWebSocket, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'
import { isTauri } from '@/services/env'
import { activationStateAtom, type ActivationState } from '@/components/intelligence/SpreadingActivation'

// ── WS event shape (subset of GraphEvent — only activation) ─────────────────

interface GraphActivationDelta {
  direct_ids: string[]
  propagated: Array<{ id: string; via: string; score: number }>
  scores: Record<string, number>
  active_edges: string[]
  query: string
}

interface GraphActivationEvent {
  type: 'graph.activation'
  layer: string
  delta: GraphActivationDelta
  activated_ids?: string[]
  scores?: Record<string, number>
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Lightweight WebSocket that only processes `graph.activation` events
 * and updates `activationStateAtom` with 2-phase animation.
 *
 * @param projectSlug  Project slug for the WS endpoint. If undefined, no connection is made.
 */
export function useActivationWebSocket(projectSlug: string | undefined): void {
  const setActivation = useSetAtom(activationStateAtom)
  const activationPhase = useAtomValue(activationStateAtom).phase
  const wsRef = useRef<IWebSocket | null>(null)
  const mountedRef = useRef(true)
  const activationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const activationPhaseRef = useRef<ActivationState['phase']>('idle')
  activationPhaseRef.current = activationPhase

  const handleActivation = useCallback(
    (event: GraphActivationEvent) => {
      if (!mountedRef.current) return

      // Skip if a local animation is already in progress (e.g. from
      // SpreadingActivation REST call) to avoid interrupting the stagger
      const currentPhase = activationPhaseRef.current
      if (currentPhase === 'searching' || currentPhase === 'direct' || currentPhase === 'propagating') {
        return
      }

      const delta = event.delta
      if (!delta) return

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

  // Connect / disconnect lifecycle
  useEffect(() => {
    if (!projectSlug) return

    mountedRef.current = true
    let shouldReconnect = true
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectDelay = 1000

    async function connect() {
      if (!shouldReconnect || !mountedRef.current) return

      try {
        const ticketParam = isTauri ? await fetchWsTicket() : null
        const path = `/ws/graph/${projectSlug}${ticketParam ? `?ticket=${ticketParam}` : ''}`
        const url = wsUrl(path)

        const ws = await createWebSocket(url, {
          onopen: () => {
            if (!mountedRef.current) return
            reconnectDelay = 1000 // Reset backoff
          },
          onmessage: (ev: MessageEvent) => {
            if (!mountedRef.current) return
            try {
              const data = JSON.parse(ev.data as string)
              if (data.type === 'graph.activation') {
                handleActivation(data as GraphActivationEvent)
              }
              // Silently ignore all other event types
            } catch {
              // Ignore non-JSON messages (e.g. auth_ok)
            }
          },
          onclose: () => {
            if (!mountedRef.current) return
            wsRef.current = null
            // Auto-reconnect with exponential backoff
            if (shouldReconnect && mountedRef.current) {
              reconnectTimer = setTimeout(() => {
                reconnectDelay = Math.min(reconnectDelay * 2, 30000)
                connect()
              }, reconnectDelay)
            }
          },
          onerror: () => {
            // onclose will fire after onerror — handled there
          },
        })

        wsRef.current = ws
      } catch {
        // Connection failed — retry with backoff
        if (shouldReconnect && mountedRef.current) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 30000)
            connect()
          }, reconnectDelay)
        }
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      shouldReconnect = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      activationTimersRef.current.forEach(clearTimeout)
      activationTimersRef.current = []
      const ws = wsRef.current
      if (ws) {
        ws.onmessage = null
        ws.close()
      }
      wsRef.current = null
    }
  }, [projectSlug, handleActivation])
}
