// ============================================================================
// useLivePulse — real-time entity pulses on the 3D graph
// ============================================================================
//
// Listens to the livePulseBus (fed by useGraphWebSocket from the graph and
// CRUD channels of `/ws/events`), resolves each id to a node on screen and
// pulses it for PULSE_MS: the node's `aAct` (white core + enlarged sprite on
// the Points tier) and its links, through TARGETED writes — `updateStyleAt`
// is O(1) per node, `updateColorsForNodes` is O(degree). Below the Points
// threshold (library sprites) the node's Object3D is scaled instead; its
// links are left alone (the library's cylinders are re-evaluated by accessor,
// an O(E) pass that a transient pulse must not pay).
//
// The per-frame writer is a job of the shared FrameAnimator, so it exists
// only while something pulses and the renderer is woken frame by frame. When
// a pulse ends the base style is re-read from the caller's style functions —
// hover-aware — and written back: exact return, no residue.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { NodePoints, NodeStyle } from './nodePoints'
import type { LinkRenderer, LinkStyle } from './linkSegments'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import type { FrameAnimator } from './frameAnimator'
import {
  PulseClock,
  buildPulseIndex,
  pulsedLinkStyle,
  pulsedNodeStyle,
  resolvePulseTarget,
} from './livePulse'
import { subscribeEntityPulse } from '../livePulseBus'

/** A node once the renderer attached its Object3D (sprite tier). */
type NodeWithObject = Graph3DNode & { __threeObj?: THREE.Object3D }

/** Scale factor of the sprite-tier Object3D at activation `act`. */
export function spriteScaleFor(act: number): number {
  return 1 + 0.6 * Math.min(1, Math.max(0, act))
}

/**
 * Write one node's activation. Points tier: a targeted style write. Sprite
 * tier: scale the node's Object3D (restored at `act = 0`). Returns whether
 * anything was written (a node absent from both tiers is a no-op).
 */
export function writeNodeActivation(
  np: NodePoints | null,
  node: Graph3DNode,
  act: number,
  baseStyle: (node: Graph3DNode) => NodeStyle,
  tint?: { r: number; g: number; b: number; k: number },
): boolean {
  if (np) {
    const idx = np.indexOf(node.id)
    if (idx < 0) return false
    let style = pulsedNodeStyle(baseStyle(node), act)
    if (tint && tint.k > 0 && act > 0) {
      const k = Math.min(1, tint.k)
      style = {
        ...style,
        r: style.r + (tint.r - style.r) * k,
        g: style.g + (tint.g - style.g) * k,
        b: style.b + (tint.b - style.b) * k,
      }
    }
    np.updateStyleAt(idx, style)
    return true
  }
  const obj = (node as NodeWithObject).__threeObj
  if (!obj) return false
  const s = spriteScaleFor(act)
  obj.scale.set(s, s, 1)
  return true
}

/** Write the links of one node at activation `act` (Points/segments tier only). */
export function writeLinkActivation(
  seg: LinkRenderer | null,
  nodeId: string,
  act: number,
  baseStyle: (link: Graph3DLink) => LinkStyle,
): void {
  if (!seg) return
  seg.updateColorsForNodes([nodeId], (l) => pulsedLinkStyle(baseStyle(l), act))
}

export interface LivePulseInput {
  nodePointsRef: React.RefObject<NodePoints | null>
  linkSegmentsRef: React.RefObject<LinkRenderer | null>
  /** The nodes on screen (the aggregated set when a scale is active). */
  nodes: readonly Graph3DNode[]
  /** Base node style, hover-aware. Read through a ref: may change identity freely. */
  baseNodeStyle: (node: Graph3DNode) => NodeStyle
  /** Base link style, hover-aware. */
  baseLinkStyle: (link: Graph3DLink) => LinkStyle
  animator: FrameAnimator
  /** False disables the hook entirely (nothing subscribed, nothing written). */
  enabled?: boolean
}

export interface LivePulseHandle {
  /** For tests / diagnostics: the clock of the pulses in flight. */
  clockRef: React.RefObject<PulseClock>
}

export function useLivePulse(input: LivePulseInput): LivePulseHandle {
  const { nodePointsRef, linkSegmentsRef, nodes, animator, enabled = true } = input
  const clockRef = useRef(new PulseClock())
  /** Node id → node, for the pulses in flight (resolved once, at trigger time). */
  const targetsRef = useRef(new Map<string, Graph3DNode>())
  const index = useMemo(() => buildPulseIndex(nodes), [nodes])

  // Always-current style functions, so the frame job never closes over a stale one.
  const baseNodeStyleRef = useRef(input.baseNodeStyle)
  const baseLinkStyleRef = useRef(input.baseLinkStyle)
  useEffect(() => {
    baseNodeStyleRef.current = input.baseNodeStyle
    baseLinkStyleRef.current = input.baseLinkStyle
  }, [input.baseNodeStyle, input.baseLinkStyle])

  // The frame job: ONE stable function (created once), so the animator holds
  // at most one job for this hook. It reads only refs, never a closure value.
  const [job] = useState(() => (now: number): boolean => {
    const clock = clockRef.current
    const { active, ended } = clock.tick(now)
    const np = nodePointsRef.current
    const seg = linkSegmentsRef.current
    for (const { id, act } of active) {
      const node = targetsRef.current.get(id)
      if (!node) continue
      writeNodeActivation(np, node, act, baseNodeStyleRef.current)
      writeLinkActivation(seg, id, act, baseLinkStyleRef.current)
    }
    for (const id of ended) {
      const node = targetsRef.current.get(id)
      targetsRef.current.delete(id)
      if (!node) continue
      writeNodeActivation(np, node, 0, baseNodeStyleRef.current)
      writeLinkActivation(seg, id, 0, baseLinkStyleRef.current)
    }
    return clock.size > 0
  })

  // Subscribe to the bus for as long as the hook is enabled.
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = subscribeEntityPulse((ids) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      let started = false
      for (const raw of ids) {
        const node = resolvePulseTarget(raw, index)
        if (!node) continue
        if (clockRef.current.trigger(node.id, now)) {
          targetsRef.current.set(node.id, node)
          started = true
        }
      }
      if (started) animator.add(job)
    })
    return unsubscribe
  }, [enabled, index, animator, job])

  // The graph changed (new buffers, new nodes): pulses in flight point at the
  // previous crate. Drop them — the creation effects rewrite every style.
  useEffect(() => {
    const clock = clockRef.current
    const targets = targetsRef.current
    return () => {
      clock.clear()
      targets.clear()
      animator.remove(job)
    }
  }, [index, animator, job])

  return { clockRef }
}
