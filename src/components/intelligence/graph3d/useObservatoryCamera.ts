// ============================================================================
// useObservatoryCamera — optional auto-camera for observatory mode
// ============================================================================
//
// When observatoryAutoCameraAtom is enabled (off by default) and activation
// events flow (WS-driven or local), the camera eases toward the active
// cluster using the SHARED clusterBounds util (computeClusterBounds +
// cameraPositionForCluster — same math as useActivationSync's zoom).
//
// User drag interrupts auto-camera: a capture-phase pointerdown listener on
// the graph container snaps the current tween to a halt and suppresses
// further auto-moves for a grace period.
//
// Imperative style: camera moves + interruption tracking live in refs — the
// only React subscriptions are the toggle atom and the activation atom that
// the graph component already consumes.
// ============================================================================

import { useEffect, useRef, type RefObject } from 'react'
import { useAtomValue } from 'jotai'

import { observatoryAutoCameraAtom } from '@/atoms/intelligence'
import { activationStateAtom } from '../SpreadingActivation'
import { computeClusterBounds, cameraPositionForCluster } from './clusterBounds'
import {
  nodeMatchesActivation,
  type ActivationSyncNode,
  type ActivationSyncGraphRef,
} from './useActivationSync'

/** After a user drag, auto-camera stays hands-off for this long */
const USER_GRACE_MS = 8000
/** Minimum interval between auto-camera moves */
const MOVE_THROTTLE_MS = 2500
/** Camera ease duration */
const EASE_MS = 1800

interface ObservatoryGraphRef extends ActivationSyncGraphRef {
  camera?: () => { position: { x: number; y: number; z: number } } | undefined
}

export function useObservatoryCamera(
  graphRef: RefObject<ObservatoryGraphRef | undefined>,
  containerRef: RefObject<HTMLDivElement | null>,
  nodes: ActivationSyncNode[],
): void {
  const enabled = useAtomValue(observatoryAutoCameraAtom)
  const activation = useAtomValue(activationStateAtom)

  const lastUserInteractionRef = useRef(0)
  const lastMoveRef = useRef(0)

  // ── User drag interrupts auto-camera ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    const onPointerDown = () => {
      lastUserInteractionRef.current = Date.now()
      // Cancel any in-flight camera tween by snapping to the current position
      // (cameraPosition with duration 0 replaces the running transition).
      try {
        const fg = graphRef.current
        if (fg && typeof fg.camera === 'function' && typeof fg.cameraPosition === 'function') {
          const cam = fg.camera()
          if (cam) {
            fg.cameraPosition(
              { x: cam.position.x, y: cam.position.y, z: cam.position.z },
              undefined as unknown as { x: number; y: number; z: number },
              0,
            )
          }
        }
      } catch { /* camera may not be ready */ }
    }

    // Capture phase — fires before OrbitControls handlers
    el.addEventListener('pointerdown', onPointerDown, true)
    return () => el.removeEventListener('pointerdown', onPointerDown, true)
  }, [enabled, containerRef, graphRef])

  // ── Ease toward the active cluster on activation flow ────────────────────
  const phase = activation.phase
  useEffect(() => {
    if (!enabled) return
    if (phase !== 'direct' && phase !== 'propagating' && phase !== 'done') return

    const fg = graphRef.current
    if (!fg || typeof fg.cameraPosition !== 'function') return

    const now = Date.now()
    if (now - lastUserInteractionRef.current < USER_GRACE_MS) return
    if (now - lastMoveRef.current < MOVE_THROTTLE_MS) return

    const activatedIds = new Set([...activation.directIds, ...activation.propagatedIds])
    if (activatedIds.size === 0) return

    // Shared centroid/radius implementation (clusterBounds.ts)
    const bounds = computeClusterBounds(nodes, (n) => nodeMatchesActivation(n, activatedIds))
    if (!bounds) return

    const { position, lookAt } = cameraPositionForCluster(bounds)
    fg.cameraPosition(position, lookAt, EASE_MS)
    lastMoveRef.current = now
  }, [enabled, phase, activation.directIds, activation.propagatedIds, nodes, graphRef])
}
