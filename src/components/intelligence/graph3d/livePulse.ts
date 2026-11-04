// ============================================================================
// livePulse — the pure logic behind "this entity just lit up"
// ============================================================================
//
// A real-time event names an entity of the graph (a note reinforced, a task
// updated, a synapse created). The node pulses for PULSE_MS and comes back to
// EXACTLY its base style. This module is the GPU-free part: the envelope, the
// clock that decides which ids are pulsing at a given instant, the id
// resolution against the graph, and the style arithmetic. The hook
// (useLivePulse.ts) only wires these to the Points / LineSegments writers.
//
// RULES (from the brief):
//   * one pulse at a time per entity — a trigger on an entity already pulsing
//     is IGNORED, never stacked and never restarted (restarting would make the
//     envelope jump and let a flood of events hold a node lit forever);
//   * exact return to the base style when the pulse ends (the caller re-reads
//     its style function; this module only says WHEN);
//   * nothing runs when nothing pulses: `size === 0` is the stop signal.
// ============================================================================

import type { NodeStyle } from './nodePoints'
import type { LinkStyle } from './linkSegments'
import type { Graph3DNode } from './useGraph3DLayout'

/** Duration of one entity pulse, ms. */
export const PULSE_MS = 2000
/** Beats inside one pulse: the node throbs twice, then rests. */
export const PULSE_BEATS = 2

/** Peak of |sin(π·BEATS·t)|·(1−t) over t∈[0,1], so the envelope reaches 1. */
const PEAK = (() => {
  let max = 0
  for (let i = 1; i < 1000; i++) {
    const t = i / 1000
    max = Math.max(max, Math.abs(Math.sin(Math.PI * PULSE_BEATS * t)) * (1 - t))
  }
  return max
})()

/**
 * Pulse envelope: 0 at t=0, two fading beats, 0 at t≥1, peak exactly 1.
 * `t` is the fraction of PULSE_MS elapsed.
 */
export function pulseEnvelope(t: number): number {
  if (!(t > 0) || t >= 1) return 0
  const v = Math.abs(Math.sin(Math.PI * PULSE_BEATS * t)) * (1 - t) / PEAK
  return Math.min(1, Math.max(0, v))
}

/** A slow breathing (0..1) for a marker that stays lit, e.g. a working agent. */
export function breathEnvelope(nowMs: number, periodMs = 1600, phase = 0): number {
  const p = periodMs > 0 ? periodMs : 1600
  return 0.5 + 0.5 * Math.sin(((nowMs % p) / p + phase) * Math.PI * 2)
}

export interface PulseTick {
  /** Every pulsing id with its current activation (0..1), in trigger order. */
  active: Array<{ id: string; act: number }>
  /** Ids whose pulse ended on this tick — the caller restores their base style. */
  ended: string[]
}

/**
 * Which ids are pulsing, and how strongly, at a given instant.
 * Time is injected (`now`) so the whole thing is testable without timers.
 */
export class PulseClock {
  private readonly starts = new Map<string, number>()

  constructor(private readonly durationMs: number = PULSE_MS) {}

  /** Start a pulse. Returns false when `id` is already pulsing (ignored). */
  trigger(id: string, now: number): boolean {
    if (this.starts.has(id)) return false
    this.starts.set(id, now)
    return true
  }

  has(id: string): boolean {
    return this.starts.has(id)
  }

  /** Number of entities currently pulsing. 0 means the animation loop may stop. */
  get size(): number {
    return this.starts.size
  }

  /** Advance to `now`: current activations, and the ids that just finished. */
  tick(now: number): PulseTick {
    const active: PulseTick['active'] = []
    const ended: string[] = []
    for (const [id, start] of this.starts) {
      const t = (now - start) / this.durationMs
      if (t >= 1) {
        ended.push(id)
        this.starts.delete(id)
      } else {
        active.push({ id, act: pulseEnvelope(t) })
      }
    }
    return { active, ended }
  }

  /** Forget one pulse (its entity left the graph). Returns whether it was pulsing. */
  forget(id: string): boolean {
    return this.starts.delete(id)
  }

  /** Forget every pulse; returns the ids the caller must restore. */
  clear(): string[] {
    const ids = [...this.starts.keys()]
    this.starts.clear()
    return ids
  }
}

// ── Id resolution ─────────────────────────────────────────────────────────────
//
// Events carry the backend id of the entity: a raw UUID for a note / task /
// decision / plan / chat_session, a path for a file, `path:name` for a symbol.
// Graph node ids are those same backend ids (useIntelligenceGraph keeps
// `node.id`), so an exact match is the normal case. The suffix match covers a
// client that prefixes its ids (`note:<uuid>`), as useActivationSync does.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Index of the graph nodes by id, plus by the UUID suffix of a prefixed id. */
export function buildPulseIndex(nodes: readonly Graph3DNode[]): Map<string, Graph3DNode> {
  const index = new Map<string, Graph3DNode>()
  for (const n of nodes) {
    index.set(n.id, n)
    const colon = n.id.indexOf(':')
    if (colon !== -1) {
      const suffix = n.id.slice(colon + 1)
      if (UUID_RE.test(suffix) && !index.has(suffix)) index.set(suffix, n)
    }
  }
  return index
}

/** The graph node an event id designates, or null when it is not on screen. */
export function resolvePulseTarget(
  id: string,
  index: Map<string, Graph3DNode>,
  aliases?: ReadonlyMap<string, string>,
): Graph3DNode | null {
  const direct = index.get(id)
  if (direct) return direct
  const colon = id.indexOf(':')
  const bare = colon !== -1 ? id.slice(colon + 1) : null
  if (bare) {
    const bySuffix = index.get(bare)
    if (bySuffix) return bySuffix
  }
  // Not drawn on its own (the dynamic scale holds it inside a closed group):
  // the activity shows on the group that contains it.
  const alias = aliases?.get(id) ?? (bare ? aliases?.get(bare) : undefined)
  return alias ? index.get(alias) ?? null : null
}

// ── Style arithmetic ──────────────────────────────────────────────────────────

/**
 * The node style while it pulses with activation `act` (0..1): the shader's
 * `aAct` whitens the core and enlarges the sprite; size and alpha are lifted
 * from the BASE so a dimmed node still shows its pulse. At `act = 0` this is
 * exactly `base` — the return to rest is not a special case.
 */
export function pulsedNodeStyle(base: NodeStyle, act: number): NodeStyle {
  const a = Math.min(1, Math.max(0, act))
  if (a === 0) return base
  return {
    r: base.r,
    g: base.g,
    b: base.b,
    alpha: Math.max(base.alpha, a),
    size: base.size * (1 + 0.45 * a),
    shape: base.shape,
    act: Math.max(base.act, 0.95 * a),
  }
}

/** The link style while one of its ends pulses: whitened and more opaque. */
export function pulsedLinkStyle(base: LinkStyle, act: number): LinkStyle {
  const a = Math.min(1, Math.max(0, act))
  if (a === 0) return base
  const k = 0.55 * a
  return {
    r: base.r + (1 - base.r) * k,
    g: base.g + (1 - base.g) * k,
    b: base.b + (1 - base.b) * k,
    a: Math.min(1, Math.max(base.a, 0.08) + 0.7 * a),
  }
}
