// ============================================================================
// useCommunityActivity — real-time community glow on the 3D graph
// ============================================================================
//
// Listens to the livePulseBus (the same feed that drives useLivePulse's node
// pulses), resolves each event id to the community it belongs to (the hull's
// renumbered communityId, through the index the component rebuilds alongside
// the hulls), and raises that community's envelope — fill opacity 0.06 → 0.20
// and a brighter wireframe — for COMMUNITY_ACTIVITY_DECAY_MS.
//
// The per-frame writer is a job of the shared FrameAnimator, so it exists only
// while at least one community is active and the renderer is woken frame by
// frame. When the last intensity reaches 0 the job returns false and the loop
// stops by itself; the envelope returns to its exact rest opacity. Nothing runs
// when there is no event: no state, no re-render, just a vertex-style write on
// the hull material.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { FrameAnimator } from './frameAnimator'
import type { CommunityHull, CommunityHullGroup } from './CommunityHulls3D'
import {
  CommunityActivityClock,
  communityFillOpacity,
  communityWireOpacity,
} from './communityActivity'
import { subscribeEntityPulse } from '../livePulseBus'

export interface CommunityActivityInput {
  /** The community hull group (ref: the latest is read at write time). */
  hullsRef: React.RefObject<CommunityHullGroup | null>
  /** Entity id → community id, rebuilt alongside the hulls (ref: latest). */
  communityIndexRef: React.RefObject<ReadonlyMap<string, number>>
  animator: FrameAnimator
  /** False disables the hook entirely (nothing subscribed, nothing written). */
  enabled?: boolean
}

/**
 * Write one hull's fill and wireframe opacities for an intensity (0..1).
 * At `intensity = 0` this is exactly the rest opacity — the return to rest is
 * not a special case.
 */
export function writeCommunityHullOpacity(hull: CommunityHull, intensity: number): void {
  const fill = hull.fillMesh.material as THREE.MeshBasicMaterial
  const wire = hull.wireMesh.material as THREE.MeshBasicMaterial
  fill.opacity = communityFillOpacity(intensity)
  wire.opacity = communityWireOpacity(intensity)
}

export function useCommunityActivity(input: CommunityActivityInput): void {
  const { hullsRef, communityIndexRef, animator, enabled = true } = input

  // The clock reads the index through a ref, so an event is always resolved
  // against the LATEST community numbering (rebuilt with the hulls).
  const clockRef = useRef(new CommunityActivityClock(communityIndexRef))
  /** Communities whose opacity the job raised — restored when they fall to 0. */
  const touchedRef = useRef(new Set<number>())
  /** The hull group the job last wrote to — detects a rebuild (renumbering). */
  const lastGroupRef = useRef<CommunityHullGroup | null>(null)

  // The frame job: ONE stable function (created once), so the animator holds
  // at most one job for this hook. It reads only refs, never a closure value.
  const [job] = useState(() => (now: number): boolean => {
    const active = clockRef.current.tick(now)
    const group = hullsRef.current
    // The hulls were rebuilt (community numbering changed): the touched set is
    // stale, and the new meshes are already at rest — forget it.
    if (group !== lastGroupRef.current) {
      lastGroupRef.current = group
      touchedRef.current.clear()
    }
    if (group) {
      const byId = new Map(group.hulls.map((h) => [h.communityId, h] as const))
      const touched = touchedRef.current
      const toWrite = new Set<number>([...active.keys(), ...touched])
      for (const id of toWrite) {
        const hull = byId.get(id)
        if (!hull) {
          touched.delete(id)
          continue
        }
        const intensity = active.get(id) ?? 0
        writeCommunityHullOpacity(hull, intensity)
        if (intensity > 0) touched.add(id)
        else touched.delete(id)
      }
    }
    return active.size > 0
  })

  // Subscribe to the bus for as long as the hook is enabled.
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = subscribeEntityPulse((ids) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      let started = false
      for (const raw of ids) {
        if (clockRef.current.trigger(raw, now)) started = true
      }
      if (started) animator.add(job)
    })
    return unsubscribe
  }, [enabled, animator, job])

  // Unmount: drop the job and forget the events.
  useEffect(() => {
    const clock = clockRef.current
    const touched = touchedRef.current
    return () => {
      clock.clear()
      touched.clear()
      animator.remove(job)
    }
  }, [animator, job])
}
