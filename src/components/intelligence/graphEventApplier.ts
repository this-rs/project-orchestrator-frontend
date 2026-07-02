// ============================================================================
// graphEventApplier — shared graph-event application pipeline
// ============================================================================
//
// Single implementation of the "apply a graph mutation event to the
// intelligence atoms" logic, shared by:
//   - useGraphWebSocket (live WS events via the EventBus)
//   - useGraphReplay    (historical events from /graph/events)
//
// Structural events (node/edge CRUD + reinforcement + community) are buffered
// and flushed in a single React update per animation frame — identical to the
// original useGraphWebSocket rAF pipeline (extracted, not duplicated).
//
// Replay-specific extras (purely additive — live behavior unchanged):
//   - `silent` mode: apply without _wsAnimation hints and without fade-out
//     delays (used when fast-forwarding to a seek target)
//   - reset(): drop pending buffered updates (backward seek / exit)
// ============================================================================

import type { GraphEvent as BackendGraphEvent } from '@/types'
import type {
  IntelligenceNode,
  IntelligenceEdge,
  IntelligenceRelationType,
} from '@/types/intelligence'
import { EDGE_STYLES } from '@/constants/intelligence'

// ── Frontend graph event types (mapped from backend GraphEvent) ─────────────

export interface GraphNodeCreated {
  type: 'graph.node_created'
  node: { id: string; type: string; label: string; layer: string; attributes?: Record<string, unknown> }
  parent_id?: string
}

export interface GraphNodeUpdated {
  type: 'graph.node_updated'
  node_id: string
  attributes: Record<string, unknown>
}

export interface GraphEdgeCreated {
  type: 'graph.edge_created'
  edge: { source: string; target: string; type: string; layer: string; attributes?: Record<string, unknown> }
}

export interface GraphEdgeRemoved {
  type: 'graph.edge_removed'
  source: string
  target: string
  edge_type: string
}

export interface GraphReinforcement {
  type: 'graph.reinforcement'
  source: string
  target: string
  new_weight: number
}

export interface GraphActivationDelta {
  direct_ids: string[]
  propagated: Array<{ id: string; via: string; score: number }>
  scores: Record<string, number>
  active_edges: string[]
  query: string
  /** Streaming phase: "direct", "propagating", "done", or absent for legacy single-event */
  phase?: 'direct' | 'propagating' | 'done'
}

export interface GraphActivation {
  type: 'graph.activation'
  layer: string
  delta: GraphActivationDelta
  activated_ids?: string[]
  scores?: Record<string, number>
}

export interface GraphCommunityChanged {
  type: 'graph.community_changed'
  node_ids: string[]
  community_id: number
  community_label?: string
}

export type FrontendGraphEvent =
  | GraphNodeCreated
  | GraphNodeUpdated
  | GraphEdgeCreated
  | GraphEdgeRemoved
  | GraphReinforcement
  | GraphActivation
  | GraphCommunityChanged

// ── Backend → frontend event mapping ─────────────────────────────────────────

/**
 * Map a backend GraphEvent (flat structure with `type: "node_created"`)
 * to the frontend GraphEvent (enriched structure with `type: "graph.node_created"`).
 *
 * The backend sends flat events with node_id, target_id, edge_type, delta fields.
 * The frontend expects structured events with nested objects (node, edge, etc.).
 */
export function mapBackendEvent(raw: BackendGraphEvent): FrontendGraphEvent | null {
  const delta = raw.delta as Record<string, unknown> | null

  switch (raw.type) {
    case 'node_created': {
      return {
        type: 'graph.node_created',
        node: {
          id: raw.node_id ?? '',
          type: (delta?.entity_type as string) ?? raw.layer,
          label: (delta?.label as string) ?? (delta?.note_type as string) ?? raw.node_id ?? '',
          layer: raw.layer,
          attributes: delta as Record<string, unknown> | undefined,
        },
      }
    }

    case 'node_updated': {
      return {
        type: 'graph.node_updated',
        node_id: raw.node_id ?? '',
        attributes: (delta as Record<string, unknown>) ?? {},
      }
    }

    case 'edge_created': {
      return {
        type: 'graph.edge_created',
        edge: {
          source: raw.node_id ?? '',
          target: raw.target_id ?? '',
          type: raw.edge_type ?? 'UNKNOWN',
          layer: raw.layer,
          attributes: delta as Record<string, unknown> | undefined,
        },
      }
    }

    case 'edge_removed': {
      return {
        type: 'graph.edge_removed',
        source: raw.node_id ?? '',
        target: raw.target_id ?? '',
        edge_type: raw.edge_type ?? '',
      }
    }

    case 'reinforcement': {
      return {
        type: 'graph.reinforcement',
        source: raw.node_id ?? '',
        target: raw.target_id ?? '',
        new_weight: (delta?.energy_delta as number) ?? 0,
      }
    }

    case 'activation': {
      // activation_result sends the full payload in delta
      const d = delta as GraphActivationDelta | null
      if (!d) return null
      return {
        type: 'graph.activation',
        layer: raw.layer,
        delta: d,
      }
    }

    case 'community_changed': {
      return {
        type: 'graph.community_changed',
        node_ids: (delta?.member_ids as string[]) ?? [],
        community_id: (delta?.community_id as number) ?? 0,
        community_label: delta?.community_label as string | undefined,
      }
    }

    default:
      return null
  }
}

// ── rAF buffer — batch multiple events into a single React update ────────────

type PendingUpdate = {
  addNodes: IntelligenceNode[]
  updateNodes: Map<string, Record<string, unknown>>
  addEdges: IntelligenceEdge[]
  removeEdgeKeys: Set<string>
  /** Silent (replay fast-forward) reinforcement weight updates: "source:target" → weight */
  updateEdgeWeights: Map<string, number>
}

function emptyPending(): PendingUpdate {
  return {
    addNodes: [],
    updateNodes: new Map(),
    addEdges: [],
    removeEdgeKeys: new Set(),
    updateEdgeWeights: new Map(),
  }
}

export function makeEdgeKey(source: string, target: string, type: string): string {
  return `${source}:${target}:${type}`
}

// ── Applier ──────────────────────────────────────────────────────────────────

type AtomSetter<T> = (update: (prev: T[]) => T[]) => void

export interface GraphEventApplierDeps {
  setNodes: AtomSetter<IntelligenceNode>
  setEdges: AtomSetter<IntelligenceEdge>
}

export interface ApplyOptions {
  /** Apply without animation hints or fade-out delays (replay fast-forward) */
  silent?: boolean
}

export interface GraphEventApplier {
  /**
   * Apply a single structural graph event. Activation events are NOT handled
   * here (they drive activationStateAtom — caller-specific) and are ignored.
   */
  apply(event: FrontendGraphEvent, opts?: ApplyOptions): void
  /** Drop pending buffered updates + cancel timers (backward seek / restart) */
  reset(): void
  /** Reset + mark unusable — call on unmount/session end */
  dispose(): void
}

/**
 * Create a graph-event applier bound to the node/edge atom setters.
 * Events are buffered and flushed via requestAnimationFrame so bursts
 * collapse into a single React state update (the original WS pipeline).
 */
export function createGraphEventApplier(deps: GraphEventApplierDeps): GraphEventApplier {
  const { setNodes, setEdges } = deps

  let pending: PendingUpdate = emptyPending()
  let rafId: number | null = null
  let disposed = false
  const timers: ReturnType<typeof setTimeout>[] = []

  // Flush buffered updates in a single React state update
  const flush = () => {
    const p = pending
    pending = emptyPending()
    rafId = null
    if (disposed) return

    const hasNodeAdds = p.addNodes.length > 0
    const hasNodeUpdates = p.updateNodes.size > 0
    const hasEdgeAdds = p.addEdges.length > 0
    const hasEdgeRemoves = p.removeEdgeKeys.size > 0
    const hasEdgeWeightUpdates = p.updateEdgeWeights.size > 0

    if (hasNodeAdds || hasNodeUpdates) {
      setNodes((prev) => {
        let next = prev
        if (hasNodeAdds) {
          // Avoid duplicates
          const existingIds = new Set(prev.map((n) => n.id))
          const newNodes = p.addNodes.filter((n) => !existingIds.has(n.id))
          if (newNodes.length > 0) {
            next = [...next, ...newNodes]
          }
        }
        if (hasNodeUpdates) {
          next = next.map((node) => {
            const updates = p.updateNodes.get(node.id)
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

    if (hasEdgeAdds || hasEdgeRemoves || hasEdgeWeightUpdates) {
      setEdges((prev) => {
        let next = prev
        if (hasEdgeRemoves) {
          next = next.filter((e) => {
            const relType = (e.data as { relationType?: string })?.relationType ?? ''
            return !p.removeEdgeKeys.has(makeEdgeKey(e.source, e.target, relType))
          })
        }
        if (hasEdgeWeightUpdates) {
          next = next.map((e) => {
            const relType = (e.data as { relationType?: string })?.relationType
            if (relType !== 'SYNAPSE') return e
            const weight = p.updateEdgeWeights.get(`${e.source}:${e.target}`)
            if (weight === undefined) return e
            return {
              ...e,
              data: { ...e.data!, weight } as IntelligenceEdge['data'],
            }
          })
        }
        if (hasEdgeAdds) {
          // Avoid duplicate edges when replay overlaps with existing data
          const existingKeys = new Set(
            next.map((e) => makeEdgeKey(e.source, e.target, (e.data as { relationType?: string })?.relationType ?? '')),
          )
          const newEdges = p.addEdges.filter(
            (e) => !existingKeys.has(makeEdgeKey(e.source, e.target, (e.data as { relationType?: string })?.relationType ?? '')),
          )
          if (newEdges.length > 0) {
            next = [...next, ...newEdges]
          }
        }
        return next
      })
    }
  }

  // Schedule a flush on next animation frame (batching)
  const scheduleFlush = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(flush)
    }
  }

  const apply = (event: FrontendGraphEvent, opts?: ApplyOptions) => {
    if (disposed) return
    const silent = opts?.silent ?? false

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
            ...(silent ? {} : { _wsAnimation: 'fly-in', _wsAnimKey: Date.now() }),
          } as IntelligenceNode['data'],
        }
        pending.addNodes.push(newNode)
        scheduleFlush()
        break
      }

      case 'graph.node_updated': {
        // Animation hint: flash for updated nodes
        pending.updateNodes.set(event.node_id, {
          ...event.attributes,
          ...(silent ? {} : { _wsAnimation: 'flash', _wsAnimKey: Date.now() }),
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
          : relationType === 'CO_CHANGED_TRANSITIVE' ? 'co_changed'
          : relationType === 'AFFECTS' ? 'affects'
          : 'default'
        const attrs = e.attributes ?? {}

        const newEdge: IntelligenceEdge = {
          id: `e-${e.source}-${e.target}-ws-${Date.now()}-${pending.addEdges.length}`,
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
            ...(silent ? {} : { _wsAnimation: 'draw-in', _wsAnimKey: Date.now() }),
          } as IntelligenceEdge['data'],
        }
        pending.addEdges.push(newEdge)
        scheduleFlush()
        break
      }

      case 'graph.edge_removed': {
        const removeKey = makeEdgeKey(event.source, event.target, event.edge_type)

        if (silent) {
          // No fade-out — buffered immediate removal
          pending.removeEdgeKeys.add(removeKey)
          scheduleFlush()
          break
        }

        // Animation: mark edges with fade-out, then remove after delay
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
        const timer = setTimeout(() => {
          if (disposed) return
          setEdges((prev) =>
            prev.filter((e) => {
              const relType = (e.data as { relationType?: string })?.relationType ?? ''
              return makeEdgeKey(e.source, e.target, relType) !== removeKey
            }),
          )
        }, 400)
        timers.push(timer)
        break
      }

      case 'graph.reinforcement': {
        if (silent) {
          // Buffered weight update — no pulse animation during fast-forward
          pending.updateEdgeWeights.set(`${event.source}:${event.target}`, event.new_weight)
          scheduleFlush()
          break
        }

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

      case 'graph.community_changed': {
        // Batch update community attributes on affected nodes + re-color animation
        const animKey = Date.now()
        for (const nodeId of event.node_ids) {
          const attrs: Record<string, unknown> = {
            communityId: event.community_id,
            ...(silent ? {} : { _wsAnimation: 'community', _wsAnimKey: animKey }),
          }
          if (event.community_label) {
            attrs.communityLabel = event.community_label
          }
          pending.updateNodes.set(nodeId, attrs)
        }
        scheduleFlush()
        break
      }

      case 'graph.activation':
        // Activation drives activationStateAtom — handled by the caller
        break
    }
  }

  const reset = () => {
    pending = emptyPending()
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    timers.forEach(clearTimeout)
    timers.length = 0
  }

  const dispose = () => {
    reset()
    disposed = true
  }

  return { apply, reset, dispose }
}
