// ============================================================================
// useActivationSync — imperative Three.js activation overlay for ForceGraph3D
// ============================================================================
//
// Subscribes to activationStateAtom (jotai) and imperatively manages:
//   - Per-node sprite opacity (1.0 direct, 0.85 propagated, 0.12 dimmed)
//   - Camera zoom to activated cluster centroid
//
// NOTE — no PointLights. The old per-node PointLight glow illuminated only the
// link cylinders (the scene's sole MeshLambertMaterial). Nodes are billboard
// Sprites (unlit) and links are now a single unlit LineSegments, so a PointLight
// reaches nothing and only forces shader recompiles + per-fragment cost. The
// activation "glow" is carried by sprite opacity here and edge color/alpha in
// the link renderer, mirroring po-graph's `aAct` attribute instead of lights.
//
// Zero React re-renders — all mutations are imperative Three.js operations.
// Reusable with ANY ForceGraph3D instance (no IntelligenceGraph3D specifics).
// ============================================================================

import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import * as THREE from 'three'

import { activationStateAtom } from '../SpreadingActivation'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal node shape required by the hook (subset of Graph3DNode). */
export interface ActivationSyncNode {
  id: string
  /** Optional raw entity UUID — used for flexible ID matching. */
  entityId?: string
  /** d3-force-3d mutable positions */
  x?: number
  y?: number
  z?: number
  /** Three.js object attached by react-force-graph-3d */
  __threeObj?: THREE.Object3D
}

/** ForceGraph3D ref — only the methods we actually call. */
export interface ActivationSyncGraphRef {
  scene?: () => THREE.Scene | undefined
  cameraPosition?: (
    pos: { x: number; y: number; z: number },
    lookAt: { x: number; y: number; z: number },
    duration: number,
  ) => void
}

type AnySpriteChild = THREE.Sprite
interface SpriteOriginal { opacity: number; color: string }

// ── Helpers (pure functions — no component state) ─────────────────────────────

function ensureOwnedMaterial(sprite: AnySpriteChild): THREE.SpriteMaterial {
  if (!(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial) {
    sprite.material = (sprite.material as THREE.SpriteMaterial).clone()
    ;(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial = true
  }
  return sprite.material as THREE.SpriteMaterial
}

function saveSprite(sprite: AnySpriteChild): SpriteOriginal {
  const mat = sprite.material as THREE.SpriteMaterial
  return { opacity: mat.opacity, color: '#' + (mat.color?.getHexString?.() ?? 'ffffff') }
}

function restoreSprite(sprite: AnySpriteChild, orig: SpriteOriginal): void {
  const mat = sprite.material as THREE.SpriteMaterial
  mat.opacity = orig.opacity
  mat.color = new THREE.Color(orig.color)
  mat.needsUpdate = true
}

// ── Node ID matching ──────────────────────────────────────────────────────────
//
// Activation IDs are raw UUIDs from the backend.
// Graph node IDs may be prefixed (e.g. "note:uuid", "decision:uuid").
// We match flexibly:
//   1. Exact match:        node.id === activationId
//   2. Suffix match:       node.id ends with `:${activationId}`
//   3. entityId fallback:  node.entityId === activationId

function nodeMatchesActivation(
  node: ActivationSyncNode,
  activatedIds: Set<string>,
): boolean {
  if (activatedIds.has(node.id)) return true
  if (node.entityId && activatedIds.has(node.entityId)) return true
  // Suffix match: check if any activated ID is a suffix of node.id after ":"
  const colonIdx = node.id.indexOf(':')
  if (colonIdx !== -1) {
    const rawId = node.id.slice(colonIdx + 1)
    if (activatedIds.has(rawId)) return true
  }
  return false
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Imperatively syncs spreading-activation visuals onto a ForceGraph3D scene.
 *
 * @param graphRef  React ref to the ForceGraph3D instance
 * @param nodes     Current graph nodes (must have `__threeObj` attached by the renderer)
 * @param wake      Optional render-loop wake-up. MUST be provided when the host
 *                  component renders on demand: every mutation below is an
 *                  imperative Three.js change that produces no React render, so
 *                  without it the activation visuals would never be drawn.
 */
export function useActivationSync(
  graphRef: React.RefObject<ActivationSyncGraphRef | undefined>,
  nodes: ActivationSyncNode[],
  wake?: (ms?: number) => void,
): void {
  const activation = useAtomValue(activationStateAtom)
  const activationPhase = activation.phase

  // ── Dirty tracking refs ─────────────────────────────────────────────────
  const dirtyRef = useRef<{
    sprites: Map<AnySpriteChild, SpriteOriginal>
    nodeStates: Map<string, 'direct' | 'propagated' | 'dimmed'>
  }>({ sprites: new Map(), nodeStates: new Map() })

  // ── Imperative sprite/light sync ────────────────────────────────────────
  useEffect(() => {
    // wake: adds/removes PointLights and rewrites sprite opacity on every node
    // (both the activation and the deactivation path return early below).
    wake?.()

    const fg = graphRef.current
    if (!fg || typeof fg.scene !== 'function') return

    const isActive = activationPhase !== 'idle' && activationPhase !== 'searching'
    const dirty = dirtyRef.current

    if (activationPhase === 'searching') return

    // ── DEACTIVATION ──
    if (!isActive) {
      for (const [sprite, orig] of dirty.sprites) { restoreSprite(sprite, orig) }
      dirty.sprites.clear()
      dirty.nodeStates.clear()
      return
    }

    // ── ACTIVE PHASE ──
    const newNodeStates = new Map<string, 'direct' | 'propagated' | 'dimmed'>()

    for (const node of nodes) {
      const obj = (node as ActivationSyncNode & { __threeObj?: THREE.Object3D }).__threeObj
      if (!obj) continue

      const isDirect = nodeMatchesActivation(node, activation.directIds)
      const isPropagated = !isDirect && nodeMatchesActivation(node, activation.propagatedIds)
      const desiredState: 'direct' | 'propagated' | 'dimmed' = isDirect ? 'direct' : isPropagated ? 'propagated' : 'dimmed'
      newNodeStates.set(node.id, desiredState)

      const prevState = dirty.nodeStates.get(node.id)
      if (prevState === desiredState && desiredState === 'dimmed') continue

      // ── Sprite opacity updates ──
      const targetOpacity = isDirect ? 1.0 : isPropagated ? 0.85 : 0.12
      obj.traverse((child) => {
        if (child instanceof THREE.Sprite && child.material) {
          if (!dirty.sprites.has(child)) { dirty.sprites.set(child, saveSprite(child)) }
          const mat = ensureOwnedMaterial(child)
          mat.opacity = targetOpacity
          mat.needsUpdate = true
        }
      })
    }

    dirty.nodeStates = newNodeStates
  }, [activationPhase, activation.directIds, activation.propagatedIds, nodes, graphRef, wake])

  // ── Camera zoom to activated cluster ────────────────────────────────────
  const prevActivationPhaseRef = useRef<string>('idle')
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || typeof fg.cameraPosition !== 'function') return

    // Zoom when transitioning into 'direct' phase (results just arrived)
    const wasIdle = prevActivationPhaseRef.current === 'idle' || prevActivationPhaseRef.current === 'searching'
    prevActivationPhaseRef.current = activationPhase

    if (!wasIdle || (activationPhase !== 'direct' && activationPhase !== 'done')) return

    const allActivated = new Set([...activation.directIds, ...activation.propagatedIds])
    if (allActivated.size === 0) return

    // Compute centroid of activated nodes
    let cx = 0, cy = 0, cz = 0, count = 0
    const positions: { x: number; y: number; z: number }[] = []

    for (const node of nodes) {
      if (!nodeMatchesActivation(node, allActivated)) continue
      const x = node.x ?? 0
      const y = node.y ?? 0
      const z = node.z ?? 0
      cx += x; cy += y; cz += z; count++
      positions.push({ x, y, z })
    }

    if (count === 0) return
    cx /= count; cy /= count; cz /= count

    // Compute radius of the activated cluster
    let maxDist = 0
    for (const p of positions) {
      const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2)
      if (d > maxDist) maxDist = d
    }

    // Position camera at a distance proportional to cluster radius
    const dist = Math.max(maxDist * 2.5, 120)
    const angle = Math.atan2(cy, cx)
    const camX = cx + dist * Math.cos(angle + 0.3)
    const camY = cy + dist * 0.4
    const camZ = cz + dist * Math.sin(angle + 0.3)

    fg.cameraPosition(
      { x: camX, y: camY, z: camZ },
      { x: cx, y: cy, z: cz },
      1200,
    )
    // wake: the camera tween is advanced by tweenGroup.update() inside the
    // render loop — it needs every frame of its 1200 ms duration (+ margin).
    wake?.(1700)
  }, [activationPhase, activation.directIds, activation.propagatedIds, nodes, graphRef, wake])
}
