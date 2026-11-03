// ============================================================================
// useAgentMarkers — the agents running now, attached to their node
// ============================================================================
//
// Data: `GET /api/agents/live` through useLiveAgents (5 s poll while the tab is
// visible, immediate re-read on `attention_changed`). The socket pushes no
// agent list and no "session touched entity" event — see agentMarkers.ts.
//
// Drawing: one billboard label per placed agent (agentMarkers.ts), above the
// node it resolves to (its own chat_session node, else its task, else its
// plan), and the node itself lit through the Points shader's `aAct`, tinted
// with the agent's colour: breathing while the agent streams, steady while it
// waits on the user, untouched while idle. The breathing is a FrameAnimator
// job that exists only while at least one placed agent is streaming — when
// nobody works, no frame is scheduled.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { useLiveAgents } from '@/hooks/useLiveAgents'
import type { NodePoints, NodeStyle } from './nodePoints'
import type { Graph3DNode } from './useGraph3DLayout'
import type { FrameAnimator } from './frameAnimator'
import { breathEnvelope, buildPulseIndex } from './livePulse'
import { agentRgb, createAgentMarkers, placeAgents, type AgentMarkers, type PlacedAgent } from './agentMarkers'
import { activatedNodeStyle, writeNodeActivation } from './useLivePulse'

/** Applies something on top of a node's bulk style (identity when nothing applies). */
export type NodeStyleOverlay = (node: Graph3DNode, style: NodeStyle) => NodeStyle

/** Activation of a node under an agent in a given state, at time `now`. */
export function agentNodeActivation(state: PlacedAgent['state'], now: number, sessionId: string): number {
  if (state === 'streaming') {
    // Per-session phase so several agents do not breathe in lockstep.
    let phase = 0
    for (let i = 0; i < sessionId.length; i++) phase = (phase + sessionId.charCodeAt(i)) % 97
    return 0.35 + 0.55 * breathEnvelope(now, 1600, phase / 97)
  }
  if (state === 'waiting_input') return 0.5
  return 0
}

export interface AgentMarkersInput {
  graphRef: React.RefObject<{ scene?: () => THREE.Scene | undefined } | undefined>
  nodePointsRef: React.RefObject<NodePoints | null>
  /** Owned by the caller (declared before its engine-tick callback), filled here. */
  markersRef: React.MutableRefObject<AgentMarkers | null>
  nodes: readonly Graph3DNode[]
  baseNodeStyle: (node: Graph3DNode) => NodeStyle
  animator: FrameAnimator
  /** False: no poll, nothing drawn (the caller gates on scene readiness). */
  enabled?: boolean
  /**
   * Filled with the agents' overlay: the caller's BULK restyles pass every node
   * through it, so a steady state (waiting_input) survives a selection / legend
   * / heatmap restyle instead of being drawn once and overwritten.
   */
  overlayRef?: React.MutableRefObject<NodeStyleOverlay>
}

export interface AgentMarkersHandle {
  placed: PlacedAgent[]
  unplaced: string[]
}

export function useAgentMarkers(input: AgentMarkersInput): AgentMarkersHandle {
  const { graphRef, nodePointsRef, markersRef, overlayRef, nodes, animator, enabled = true } = input
  const { data } = useLiveAgents()
  const agents = useMemo(() => (enabled ? data?.agents ?? [] : []), [enabled, data])
  const index = useMemo(() => buildPulseIndex(nodes), [nodes])
  const placement = useMemo(() => placeAgents(agents, (id) => index.has(id)), [agents, index])

  const baseNodeStyleRef = useRef(input.baseNodeStyle)
  useEffect(() => {
    baseNodeStyleRef.current = input.baseNodeStyle
  }, [input.baseNodeStyle])

  // Labels: one group, created lazily the first time the scene exists (the
  // library mounts after the container is measured, often after the first
  // poll), removed from the scene it was added to when the hook unmounts.
  const sceneRef = useRef<THREE.Scene | null>(null)
  const ensureMarkers = useCallback((): AgentMarkers | null => {
    if (markersRef.current) return markersRef.current
    const fg = graphRef.current
    const scene = fg && typeof fg.scene === 'function' ? fg.scene() : undefined
    if (!scene) return null
    const markers = createAgentMarkers()
    scene.add(markers.group)
    sceneRef.current = scene
    markersRef.current = markers
    return markers
  }, [graphRef, markersRef])
  useEffect(() => {
    return () => {
      const markers = markersRef.current
      if (!markers) return
      sceneRef.current?.remove(markers.group)
      markers.dispose()
      markersRef.current = null
      sceneRef.current = null
    }
  }, [markersRef])

  // Placement → labels, and the lit nodes. Restores the nodes an agent left.
  const litRef = useRef(new Map<string, Graph3DNode>())
  const placedRef = useRef<PlacedAgent[]>([])
  /** Lit node id → the agent lighting it (the overlay reads it at restyle time). */
  const litAgentRef = useRef(new Map<string, PlacedAgent>())

  // The overlay: ONE stable function reading refs. A bulk restyle calls it per
  // node; only the lit nodes (a handful) pay more than a Map miss.
  const [overlay] = useState(() => (node: Graph3DNode, style: NodeStyle): NodeStyle => {
    const p = litAgentRef.current.get(node.id)
    if (!p) return style
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return activatedNodeStyle(style, agentNodeActivation(p.state, now, p.session_id), { ...agentRgb(p.session_id), k: 0.6 })
  })
  useEffect(() => {
    if (!overlayRef) return
    overlayRef.current = overlay
    return () => {
      if (overlayRef.current === overlay) overlayRef.current = (_node, style) => style
    }
  }, [overlayRef, overlay])
  useEffect(() => {
    placedRef.current = placement.placed
    if (enabled) ensureMarkers()?.set(placement.placed, (id) => index.get(id))
    else markersRef.current?.set([], () => undefined)
    const np = nodePointsRef.current
    const nextLit = new Map<string, Graph3DNode>()
    const nextAgents = new Map<string, PlacedAgent>()
    for (const p of placement.placed) {
      if (p.state === 'idle') continue
      const node = index.get(p.nodeId)
      if (node) {
        nextLit.set(p.nodeId, node)
        nextAgents.set(p.nodeId, p)
      }
    }
    litAgentRef.current = nextAgents
    for (const [id, node] of litRef.current) {
      if (!nextLit.has(id)) writeNodeActivation(np, node, 0, baseNodeStyleRef.current)
    }
    litRef.current = nextLit
    // Draw the steady states once; the breathing job (below) handles the rest.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    for (const p of placement.placed) {
      const node = nextLit.get(p.nodeId)
      if (!node) continue
      const c = agentRgb(p.session_id)
      writeNodeActivation(np, node, agentNodeActivation(p.state, now, p.session_id), baseNodeStyleRef.current, { ...c, k: 0.6 })
    }
    animator.wakeOnce()
  }, [placement, index, nodePointsRef, animator, markersRef, enabled, ensureMarkers])

  // Breathing job: ONE stable function, alive only while a placed agent is streaming.
  const [job] = useState(() => (now: number): boolean => {
    const np = nodePointsRef.current
    let streaming = false
    for (const p of placedRef.current) {
      if (p.state !== 'streaming') continue
      const node = litRef.current.get(p.nodeId)
      if (!node) continue
      streaming = true
      const c = agentRgb(p.session_id)
      writeNodeActivation(np, node, agentNodeActivation(p.state, now, p.session_id), baseNodeStyleRef.current, { ...c, k: 0.6 })
    }
    return streaming
  })
  const anyStreaming = placement.placed.some((p) => p.state === 'streaming' && index.has(p.nodeId))
  useEffect(() => {
    if (anyStreaming) animator.add(job)
    else animator.remove(job)
  }, [anyStreaming, animator, placement, job])

  // Unmount / graph change: nothing may stay lit on a crate that is going away.
  // The Points object is read AT cleanup time on purpose: it is the one that
  // holds the lit vertices (an imperative scene object, not a React node).
  useEffect(() => {
    const lit = litRef.current
    const points = nodePointsRef
    return () => {
      const np = points.current
      for (const node of lit.values()) writeNodeActivation(np, node, 0, baseNodeStyleRef.current)
      lit.clear()
      litAgentRef.current = new Map()
      animator.remove(job)
    }
  }, [index, animator, nodePointsRef, job])

  return { placed: placement.placed, unplaced: placement.unplaced }
}
