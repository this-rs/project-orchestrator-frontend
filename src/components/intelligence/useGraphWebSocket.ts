import { useEffect, useRef, useCallback, useState } from 'react'
import { useSetAtom } from 'jotai'
import { intelligenceNodesAtom, intelligenceEdgesAtom } from '@/atoms/intelligence'
import { createWebSocket, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'
import { isTauri } from '@/services/env'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceRelationType } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'
import { activationStateAtom, type ActivationState } from './SpreadingActivation'
import { useAtomValue } from 'jotai'

// ============================================================================
// GRAPH WEBSOCKET EVENT TYPES
// ============================================================================

interface GraphNodeCreated {
  type: 'graph.node_created'
  node: { id: string; type: string; label: string; layer: string; attributes?: Record<string, unknown> }
  parent_id?: string
}

interface GraphNodeUpdated {
  type: 'graph.node_updated'
  node_id: string
  attributes: Record<string, unknown>
}

interface GraphEdgeCreated {
  type: 'graph.edge_created'
  edge: { source: string; target: string; type: string; layer: string; attributes?: Record<string, unknown> }
}

interface GraphEdgeRemoved {
  type: 'graph.edge_removed'
  source: string
  target: string
  edge_type: string
}

interface GraphReinforcement {
  type: 'graph.reinforcement'
  source: string
  target: string
  new_weight: number
}

interface GraphActivationDelta {
  direct_ids: string[]
  propagated: Array<{ id: string; via: string; score: number }>
  scores: Record<string, number>
  active_edges: string[]
  query: string
  /** Streaming phase: "direct", "propagating", "done", or absent for legacy single-event */
  phase?: 'direct' | 'propagating' | 'done'
}

interface GraphActivation {
  type: 'graph.activation'
  layer: string
  delta: GraphActivationDelta
  activated_ids?: string[]
  scores?: Record<string, number>
}

interface GraphCommunityChanged {
  type: 'graph.community_changed'
  node_ids: string[]
  community_id: number
  community_label?: string
}

type GraphEvent =
  | GraphNodeCreated
  | GraphNodeUpdated
  | GraphEdgeCreated
  | GraphEdgeRemoved
  | GraphReinforcement
  | GraphActivation
  | GraphCommunityChanged

// ============================================================================
// rAF BUFFER — batch multiple events into a single React update
// ============================================================================

type PendingUpdate = {
  addNodes: IntelligenceNode[]
  updateNodes: Map<string, Record<string, unknown>>
  addEdges: IntelligenceEdge[]
  removeEdgeKeys: Set<string>
}

function emptyPending(): PendingUpdate {
  return {
    addNodes: [],
    updateNodes: new Map(),
    addEdges: [],
    removeEdgeKeys: new Set(),
  }
}

function makeEdgeKey(source: string, target: string, type: string): string {
  return `${source}:${target}:${type}`
}

// ============================================================================
// HOOK
// ============================================================================

export interface GraphWsState {
  /** Whether the WS is connected */
  connected: boolean
  /** Timestamp of last received event (for Live pulse) */
  lastEventAt: number | null
}

/**
 * Hook that connects to the backend graph WS endpoint and applies
 * real-time updates to the intelligence graph atoms.
 *
 * Events are buffered via requestAnimationFrame to avoid excessive re-renders.
 */
export function useGraphWebSocket(projectSlug: string | undefined): GraphWsState {
  const setNodes = useSetAtom(intelligenceNodesAtom)
  const setEdges = useSetAtom(intelligenceEdgesAtom)
  const setActivation = useSetAtom(activationStateAtom)
  const activationPhase = useAtomValue(activationStateAtom).phase
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  const wsRef = useRef<IWebSocket | null>(null)
  const pendingRef = useRef<PendingUpdate>(emptyPending())
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const activationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // Track current activation phase in a ref so the memoized callback sees latest value
  const activationPhaseRef = useRef<ActivationState['phase']>('idle')
  activationPhaseRef.current = activationPhase

  // Flush buffered updates in a single React state update
  const flush = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = emptyPending()
    rafRef.current = null

    const hasNodeAdds = pending.addNodes.length > 0
    const hasNodeUpdates = pending.updateNodes.size > 0
    const hasEdgeAdds = pending.addEdges.length > 0
    const hasEdgeRemoves = pending.removeEdgeKeys.size > 0

    if (hasNodeAdds || hasNodeUpdates) {
      setNodes((prev) => {
        let next = prev
        if (hasNodeAdds) {
          // Avoid duplicates
          const existingIds = new Set(prev.map((n) => n.id))
          const newNodes = pending.addNodes.filter((n) => !existingIds.has(n.id))
          if (newNodes.length > 0) {
            next = [...next, ...newNodes]
          }
        }
        if (hasNodeUpdates) {
          next = next.map((node) => {
            const updates = pending.updateNodes.get(node.id)
            if (!updates) return node
            return {
              ...node,
              data: { ...node.data, ...updates } as IntelligenceNode['data'],
            }
          })
        }
        return next
      })
    }

    if (hasEdgeAdds || hasEdgeRemoves) {
      setEdges((prev) => {
        let next = prev
        if (hasEdgeRemoves) {
          next = next.filter((e) => {
            const relType = (e.data as { relationType?: string })?.relationType ?? ''
            return !pending.removeEdgeKeys.has(makeEdgeKey(e.source, e.target, relType))
          })
        }
        if (hasEdgeAdds) {
          next = [...next, ...pending.addEdges]
        }
        return next
      })
    }
  }, [setNodes, setEdges])

  // Schedule a flush on next animation frame (batching)
  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [flush])

  // Process a single graph event
  const handleEvent = useCallback(
    (event: GraphEvent) => {
      if (!mountedRef.current) return
      setLastEventAt(Date.now())

      switch (event.type) {
        case 'graph.node_created': {
          const n = event.node
          const newNode: IntelligenceNode = {
            id: n.id,
            type: n.type,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: {
              label: n.label,
              entityType: n.type as IntelligenceNode['data']['entityType'],
              layer: n.layer as IntelligenceNode['data']['layer'],
              entityId: n.id,
              ...(n.attributes ?? {}),
              // Animation hint: fly-in for new nodes
              _wsAnimation: 'fly-in',
              _wsAnimKey: Date.now(),
            } as IntelligenceNode['data'],
          }
          pendingRef.current.addNodes.push(newNode)
          scheduleFlush()
          break
        }

        case 'graph.node_updated': {
          // Animation hint: flash for updated nodes
          pendingRef.current.updateNodes.set(event.node_id, {
            ...event.attributes,
            _wsAnimation: 'flash',
            _wsAnimKey: Date.now(),
          })
          scheduleFlush()
          break
        }

        case 'graph.edge_created': {
          const e = event.edge
          const relationType = e.type as IntelligenceRelationType
          const style = EDGE_STYLES[relationType] ?? { color: '#6B7280', strokeWidth: 1 }
          const edgeType = relationType === 'SYNAPSE' ? 'synapse'
            : relationType === 'CO_CHANGED' ? 'co_changed'
            : relationType === 'AFFECTS' ? 'affects'
            : 'default'
          const attrs = e.attributes ?? {}

          const newEdge: IntelligenceEdge = {
            id: `e-${e.source}-${e.target}-ws-${Date.now()}`,
            source: e.source,
            target: e.target,
            type: edgeType,
            animated: style.animated ?? false,
            ...(edgeType === 'default' ? {
              style: {
                stroke: style.color,
                strokeWidth: style.strokeWidth,
                strokeDasharray: style.strokeDasharray,
              },
            } : {}),
            data: {
              relationType,
              layer: e.layer,
              weight: (attrs.weight as number) ?? undefined,
              confidence: (attrs.confidence as number) ?? undefined,
              count: (attrs.co_change_count as number) ?? (attrs.count as number) ?? undefined,
              // Animation hint: draw-in for new edges
              _wsAnimation: 'draw-in',
              _wsAnimKey: Date.now(),
            } as IntelligenceEdge['data'],
          }
          pendingRef.current.addEdges.push(newEdge)
          scheduleFlush()
          break
        }

        case 'graph.edge_removed': {
          // Animation: mark edges with fade-out, then remove after delay
          const removeKey = makeEdgeKey(event.source, event.target, event.edge_type)
          setEdges((prev) =>
            prev.map((e) => {
              const relType = (e.data as { relationType?: string })?.relationType ?? ''
              if (makeEdgeKey(e.source, e.target, relType) === removeKey) {
                return {
                  ...e,
                  data: {
                    ...e.data!,
                    _wsAnimation: 'fade-out',
                    _wsAnimKey: Date.now(),
                  } as IntelligenceEdge['data'],
                }
              }
              return e
            }),
          )
          // Actually remove after fade-out animation completes
          setTimeout(() => {
            if (!mountedRef.current) return
            setEdges((prev) =>
              prev.filter((e) => {
                const relType = (e.data as { relationType?: string })?.relationType ?? ''
                return makeEdgeKey(e.source, e.target, relType) !== removeKey
              }),
            )
          }, 400)
          break
        }

        case 'graph.reinforcement': {
          // Animation: pulse synapse edge + update weight
          setEdges((prev) =>
            prev.map((e) => {
              if (e.source === event.source && e.target === event.target) {
                const relType = (e.data as { relationType?: string })?.relationType
                if (relType === 'SYNAPSE') {
                  return {
                    ...e,
                    data: {
                      ...e.data!,
                      weight: event.new_weight,
                      _wsAnimation: 'pulse',
                      _wsAnimKey: Date.now(),
                    } as IntelligenceEdge['data'],
                  }
                }
              }
              return e
            }),
          )
          break
        }

        case 'graph.activation': {
          // If a local animation is already in progress (triggered by REST in
          // SpreadingActivation.tsx), skip the WS echo to avoid interrupting
          // the staggered animation. Only apply when phase is 'idle' or 'done'.
          const currentPhase = activationPhaseRef.current
          if (currentPhase === 'searching' || currentPhase === 'direct' || currentPhase === 'propagating') {
            break
          }

          const delta = event.delta
          if (!delta) break

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
            break
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
          break
        }

        case 'graph.community_changed': {
          // Batch update community attributes on affected nodes + re-color animation
          const animKey = Date.now()
          for (const nodeId of event.node_ids) {
            const attrs: Record<string, unknown> = {
              communityId: event.community_id,
              _wsAnimation: 'community',
              _wsAnimKey: animKey,
            }
            if (event.community_label) {
              attrs.communityLabel = event.community_label
            }
            pendingRef.current.updateNodes.set(nodeId, attrs)
          }
          scheduleFlush()
          break
        }
      }
    },
    [scheduleFlush, setEdges, setActivation],
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
            setConnected(true)
            reconnectDelay = 1000 // Reset backoff
          },
          onmessage: (ev: MessageEvent) => {
            if (!mountedRef.current) return
            try {
              const data = JSON.parse(ev.data as string) as GraphEvent
              if (data.type?.startsWith('graph.')) {
                handleEvent(data)
              }
            } catch {
              // Ignore non-JSON messages (e.g. auth_ok)
            }
          },
          onclose: () => {
            if (!mountedRef.current) return
            setConnected(false)
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
            // onclose will fire after onerror
          },
        })

        wsRef.current = ws
      } catch {
        // Connection failed — retry
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      activationTimersRef.current.forEach(clearTimeout)
      activationTimersRef.current = []
      const ws = wsRef.current
      if (ws) {
        ws.onmessage = null
        ws.close()
      }
      wsRef.current = null
    }
  }, [projectSlug, handleEvent])

  return { connected, lastEventAt }
}
