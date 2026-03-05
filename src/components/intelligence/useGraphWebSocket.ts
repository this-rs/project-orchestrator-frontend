import { useEffect, useRef, useCallback, useState } from 'react'
import { useSetAtom } from 'jotai'
import { intelligenceNodesAtom, intelligenceEdgesAtom } from '@/atoms/intelligence'
import { createWebSocket, type IWebSocket } from '@/services/wsAdapter'
import { wsUrl } from '@/services/env'
import { fetchWsTicket } from '@/services/auth'
import { isTauri } from '@/services/env'
import type { IntelligenceNode, IntelligenceEdge, IntelligenceRelationType } from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

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

interface GraphActivation {
  type: 'graph.activation'
  activated_ids: string[]
  scores: Record<string, number>
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
  const [connected, setConnected] = useState(false)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  const wsRef = useRef<IWebSocket | null>(null)
  const pendingRef = useRef<PendingUpdate>(emptyPending())
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

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
          // Activation events are handled by the SpreadingActivation component
          // via its own atom. This is a no-op here — the backend would push
          // activation data through the search API instead.
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
    [scheduleFlush, setEdges],
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
