// ============================================================================
// communityActivity — the pure logic behind "this community just lit up"
// ============================================================================
//
// The LIGHT channel of the 3D graph's visual grammar: a real-time event names
// an entity (a note reinforced, a task updated, a synapse created), and the
// community that entity belongs to glows through its translucent envelope.
// This module is the GPU-free part: the intensity model (1 just after an
// event, a linear decay to 0 over a named duration, summed and capped at 1
// when several events succeed each other), the entity→community resolution,
// and the opacity arithmetic. The hook (useCommunityActivity.ts) only wires
// these to the community-hull meshes and the FrameAnimator.
//
// RULES (from the brief):
//   * one intensity per community, 1.0 right after an event, linear decay to
//     0 over COMMUNITY_ACTIVITY_DECAY_MS;
//   * several events on the same community CUMULATE but never exceed
//     COMMUNITY_ACTIVITY_MAX (1.0) — a busy community stays lit, it does not
//     burn brighter than the grammar allows;
//   * an event on an entity absent from the graph lights NO community;
//   * nothing runs when no community is active: an empty result is the stop
//     signal for the animation loop.
// ============================================================================

/** Duration of one community's glow, ms: linear decay from 1 to 0. */
export const COMMUNITY_ACTIVITY_DECAY_MS = 2500

/** Ceiling of a community's intensity — several events never exceed it. */
export const COMMUNITY_ACTIVITY_MAX = 1

/** Rest opacity of a community hull's fill (also the build default). */
export const COMMUNITY_FILL_OPACITY_REST = 0.06

/** Peak opacity of a community hull's fill at full intensity. */
export const COMMUNITY_FILL_OPACITY_PEAK = 0.2

/** Rest opacity of a community hull's wireframe (also the build default). */
export const COMMUNITY_WIRE_OPACITY_REST = 0.03

/** Peak opacity of a community hull's wireframe at full intensity. */
export const COMMUNITY_WIRE_OPACITY_PEAK = 0.1

/** A recent event that designates one entity of the graph. */
export interface CommunityEvent {
  /** The entity id the event touched (backend id: UUID, path, path:name). */
  entityId: string
  /** When the event arrived, in the same clock as `now` (ms). */
  at: number
}

/**
 * The intensity a single event contributes at age `ageMs` since it arrived:
 * 1 at age ≤ 0, then a LINEAR decay to 0 at COMMUNITY_ACTIVITY_DECAY_MS, 0
 * beyond. `communityActivity` sums this per community and caps the sum.
 */
export function communityIntensityAt(ageMs: number): number {
  if (ageMs >= COMMUNITY_ACTIVITY_DECAY_MS) return 0
  if (ageMs <= 0) return COMMUNITY_ACTIVITY_MAX
  return 1 - ageMs / COMMUNITY_ACTIVITY_DECAY_MS
}

/**
 * The per-community intensity of a set of recent events at instant `now`.
 * `communities` maps an entity id to the community it belongs to (the hull's
 * numbering). An event on an unknown entity is ignored; several events on the
 * same community cumulate, capped at COMMUNITY_ACTIVITY_MAX. The result maps a
 * community id to its intensity (0 < i ≤ 1); a community with intensity 0 is
 * simply absent.
 */
export function communityActivity(
  events: readonly CommunityEvent[],
  communities: ReadonlyMap<string, number>,
  now: number,
): Map<number, number> {
  const out = new Map<number, number>()
  for (const ev of events) {
    const cid = communities.get(ev.entityId)
    if (cid == null) continue
    const i = communityIntensityAt(now - ev.at)
    if (i <= 0) continue
    out.set(cid, Math.min(COMMUNITY_ACTIVITY_MAX, (out.get(cid) ?? 0) + i))
  }
  return out
}

/**
 * Entity id → community id, from a node list that already carries the hull's
 * renumbered `communityId` (the output of `groupHullNodes`). Structural on
 * purpose: it needs no three.js and no full Graph3DNode.
 */
export function buildCommunityIndex(
  nodes: ReadonlyArray<{ id: string; communityId?: number }>,
): Map<string, number> {
  const index = new Map<string, number>()
  for (const n of nodes) {
    if (n.communityId == null) continue
    index.set(n.id, n.communityId)
  }
  return index
}

/** Fill opacity for an intensity (0..1): lerp between rest and peak. */
export function communityFillOpacity(intensity: number): number {
  const t = Math.min(1, Math.max(0, intensity))
  return COMMUNITY_FILL_OPACITY_REST + (COMMUNITY_FILL_OPACITY_PEAK - COMMUNITY_FILL_OPACITY_REST) * t
}

/** Wireframe opacity for an intensity (0..1): lerp between rest and peak. */
export function communityWireOpacity(intensity: number): number {
  const t = Math.min(1, Math.max(0, intensity))
  return COMMUNITY_WIRE_OPACITY_REST + (COMMUNITY_WIRE_OPACITY_PEAK - COMMUNITY_WIRE_OPACITY_REST) * t
}

/**
 * The stateful half of the LIGHT channel: it keeps the recent events and,
 * on each tick, resolves them against the CURRENT community index and returns
 * the active communities with their intensities. Time is injected (`now`) so
 * the whole thing is testable without timers.
 *
 * The index is read through a ref, never captured: the community numbering
 * is rebuilt whenever the hulls are (biggest-first), and a stale capture would
 * resolve an event to a community that no longer has that index.
 */
export class CommunityActivityClock {
  private events: CommunityEvent[] = []

  constructor(private readonly communities: { current: ReadonlyMap<string, number> }) {}

  /** Record an event. Returns false when the entity is not on the graph. */
  trigger(entityId: string, now: number): boolean {
    if (!this.communities.current.has(entityId)) return false
    this.events.push({ entityId, at: now })
    return true
  }

  /** Number of events still in flight (decayed ones are pruned by `tick`). */
  get size(): number {
    return this.events.length
  }

  /** Advance to `now`: active communities and their intensities, then prune. */
  tick(now: number): Map<number, number> {
    const active = communityActivity(this.events, this.communities.current, now)
    this.events = this.events.filter((e) => now - e.at < COMMUNITY_ACTIVITY_DECAY_MS)
    return active
  }

  /** Forget every event. */
  clear(): void {
    this.events = []
  }
}
