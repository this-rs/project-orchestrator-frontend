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
  PROPAGATION_STEP_MS,
  PulseClock,
  propagationPlan,
  buildPulseIndex,
  pulsedLinkStyle,
  pulsedNodeStyle,
  resolvePulseTarget,
} from './livePulse'
import { subscribeEntityPulse } from '../livePulseBus'

/** Voisins par id, construits une fois par jeu de liens (O(E)), puis consultés en O(1). */
function buildNeighbourIndex(links: readonly Graph3DLink[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const push = (a: string, b: string) => {
    const list = out.get(a)
    if (list) list.push(b)
    else out.set(a, [b])
  }
  for (const link of links) {
    const src = typeof link.source === 'object' ? (link.source as { id?: string }).id : link.source
    const dst = typeof link.target === 'object' ? (link.target as { id?: string }).id : link.target
    if (typeof src !== 'string' || typeof dst !== 'string' || src === dst) continue
    push(src, dst)
    push(dst, src)
  }
  return out
}

/** A node once the renderer attached its Object3D (sprite tier). */
type NodeWithObject = Graph3DNode & { __threeObj?: THREE.Object3D }

/** Scale factor of the sprite-tier Object3D at activation `act`. */
export function spriteScaleFor(act: number): number {
  return 1 + 0.6 * Math.min(1, Math.max(0, act))
}

/** A node's style at activation `act`, optionally tinted toward a colour while active. */
export function activatedNodeStyle(
  base: NodeStyle,
  act: number,
  tint?: { r: number; g: number; b: number; k: number },
): NodeStyle {
  const style = pulsedNodeStyle(base, act)
  if (!tint || !(tint.k > 0) || !(act > 0)) return style
  const k = Math.min(1, tint.k)
  return {
    ...style,
    r: style.r + (tint.r - style.r) * k,
    g: style.g + (tint.g - style.g) * k,
    b: style.b + (tint.b - style.b) * k,
  }
}

/**
 * Write one node's activation. Points tier: a targeted style write. Sprite
 * tier: scale the node's Object3D on top of its current scale (restored at
 * `act = 0`). Returns whether
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
    np.updateStyleAt(idx, activatedNodeStyle(baseStyle(node), act, tint))
    return true
  }
  const obj = (node as NodeWithObject).__threeObj
  if (!obj) return false
  // The pulse MULTIPLIES the scale the other effects set (dimmed type 0.5,
  // legend 1.6 / 0.5, group 1.3 / 0.6) instead of overwriting it, and gives
  // that scale back at rest. A scale someone else wrote mid-pulse (it differs
  // from the last one written here) becomes the new base.
  const ud = obj.userData as { pulseBase?: number; pulseWritten?: number }
  let base = ud.pulseBase ?? obj.scale.x
  if (ud.pulseWritten !== undefined && Math.abs(obj.scale.x - ud.pulseWritten) > 1e-6) base = obj.scale.x
  if (act <= 0) {
    obj.scale.set(base, base, obj.scale.z)
    delete ud.pulseBase
    delete ud.pulseWritten
    return true
  }
  const s = base * spriteScaleFor(act)
  obj.scale.set(s, s, obj.scale.z)
  ud.pulseBase = base
  ud.pulseWritten = s
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
  /** Entity id → id of the element drawn for it (a closed group of the dynamic scale). */
  aliases?: ReadonlyMap<string, string>
  /** Liens du graphe : seuls eux connaissent le voisinage, dont l onde a besoin. */
  links?: readonly Graph3DLink[]
}

export interface LivePulseHandle {
  /** For tests / diagnostics: the clock of the pulses in flight. */
  clockRef: React.RefObject<PulseClock>
}

export function useLivePulse(input: LivePulseInput): LivePulseHandle {
  const { nodePointsRef, linkSegmentsRef, nodes, animator, enabled = true } = input
  const aliasesRef = useRef(input.aliases)
  // the latest aliases for the event callback, written after render (not during it)
  useEffect(() => {
    aliasesRef.current = input.aliases
  }, [input.aliases])
  const clockRef = useRef(new PulseClock())
  /** Node id → node, for the pulses in flight (resolved once, at trigger time). */
  const targetsRef = useRef(new Map<string, Graph3DNode>())
  const index = useMemo(() => buildPulseIndex(nodes), [nodes])
  /* L'ONDE a besoin du voisinage : index id → voisins construit une fois par jeu de liens
     (O(E)) et gardé dans un ref. Le recalculer dans la boucle d'événements ferait payer O(E)
     à chaque impulsion. */
  const neighboursRef = useRef<Map<string, string[]>>(new Map())
  useEffect(() => {
    neighboursRef.current = buildNeighbourIndex(input.links ?? [])
  }, [input.links])

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
        const node = resolvePulseTarget(raw, index, aliasesRef.current)
        if (!node) continue
        if (clockRef.current.trigger(node.id, now)) {
          targetsRef.current.set(node.id, node)
          started = true
          /* ONDE : l'événement ne s'arrête pas au nœud touché. Le voisinage est réveillé
             avec un retard de `hops × PROPAGATION_STEP_MS` — l'impulsion est donc
             programmée dans le futur, et `pulseEnvelope` la tient à zéro (t ≤ 0) jusque-là.
             Plan borné en sauts ET en nœuds : le coût par image de PulseClock.tick reste
             celui de 240 entités au plus, quelle que soit la taille du graphe. */
          for (const hit of propagationPlan(node.id, (id) => neighboursRef.current.get(id) ?? [])) {
            const target = index.get(hit.id)
            if (!target) continue
            if (clockRef.current.trigger(hit.id, now + hit.hops * PROPAGATION_STEP_MS)) {
              targetsRef.current.set(hit.id, target)
            }
          }
        }
      }
      if (started) animator.add(job)
    })
    return unsubscribe
  }, [enabled, index, animator, job])

  // The graph changed. A WebSocket flush hands over NEW node objects for (mostly)
  // the SAME ids — and the event that pulses a node is the very one that
  // triggers that flush, so clearing every pulse on a new array killed them
  // after about one frame. Pulses are keyed by id and the writers resolve the
  // buffer slot by id (`indexOf`), so a pulse survives a refresh: re-point it
  // at the node object of the new set, and drop only the ones whose entity
  // left the graph (their slot is gone; the creation effects rewrite styles).
  useEffect(() => {
    const clock = clockRef.current
    const targets = targetsRef.current
    for (const id of [...targets.keys()]) {
      const node = index.get(id)
      if (node) {
        targets.set(id, node)
      } else {
        targets.delete(id)
        clock.forget(id)
      }
    }
    if (clock.size === 0) animator.remove(job)
  }, [index, animator, job])

  // Unmount (or a new animator): nothing may keep writing into the scene.
  useEffect(() => {
    const clock = clockRef.current
    const targets = targetsRef.current
    return () => {
      clock.clear()
      targets.clear()
      animator.remove(job)
    }
  }, [animator, job])

  return { clockRef }
}
