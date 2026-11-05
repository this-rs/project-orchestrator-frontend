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

/**
 * Pulse envelope: 0 at t=0, two fading beats, 0 at t≥1, peak exactly 1.
 * `t` is the fraction of PULSE_MS elapsed.
 */
/**
 * Enveloppe d'une impulsion, avec une ONDE qui dépend de l'ampleur de l'entité.
 *
 * Avant : deux battements identiques pour tout le monde — un hub de 200 liens
 * pulsait comme une note isolée. Ici, `amplitude` (0..1, calculée par l'appelant
 * à partir du degré ou du compte) ajoute des crêtes et un amortissement : une
 * note isolée fait un battement, un hub fait une onde de plusieurs crêtes qui
 * s'éteint. C'est la même famille de forme que `waveOffset` côté liens : une
 * sinusoïde amortie, pas un clignotement.
 */
export function pulseEnvelope(t: number, amplitude = 0): number {
  if (!(t > 0) || t >= 1) return 0
  const a = Math.min(1, Math.max(0, amplitude))
  const beats = PULSE_BEATS + Math.round(a * 3)                                  // 2 → 5 crêtes
  const decayExp = 1 / Math.max(0.35, 1 - a * 0.45)                              // un hub s'éteint moins vite
  const decay = 1 - Math.pow(t, decayExp)
  const v = Math.abs(Math.sin(Math.PI * beats * t)) * decay
  const peak = PEAK_FOR(beats, decayExp)
  return Math.min(1, Math.max(0, v / peak))
}

/** Le maximum de |sin(π·beats·t)|·(1−t) : calculé une fois par nombre de crêtes. */
const PEAKS = new Map<number, number>()
function PEAK_FOR(beats: number, decayExp: number): number {
  const key = beats * 100 + Math.round(decayExp * 100)
  const memo = PEAKS.get(key)
  if (memo !== undefined) return memo
  let max = 0
  for (let i = 1; i < 2000; i++) {
    const t = i / 2000
    const v = Math.abs(Math.sin(Math.PI * beats * t)) * (1 - Math.pow(t, decayExp))
    if (v > max) max = v
  }
  PEAKS.set(key, max || 1)
  return PEAKS.get(key) as number
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
/**
 * Ampleur d une impulsion, déduite de la TAILLE de base du nœud : une note isolée
 * (size 3) bat simplement, un hub (size 6+) fait une onde de plusieurs crêtes.
 * Sans ça, `pulseEnvelope` reste appelée avec son amplitude par défaut et le hub
 * pulse exactement comme une feuille — le paramètre existerait pour rien.
 */
export function pulseAmplitudeOf(base: Pick<NodeStyle, 'size'>): number {
  return Math.min(1, Math.max(0, (base.size - 2) / 6))
}

export function pulsedNodeStyle(base: NodeStyle, act: number): NodeStyle {
  const a = Math.min(1, Math.max(0, act))
  if (a === 0) return base
  const amp = pulseAmplitudeOf(base)
  const wave = pulseEnvelope(a, amp) / Math.max(1e-6, a)
  const lift = a * (1 + 0.35 * wave)   /* l onde AJOUTE au battement, elle ne le retire jamais */
  return {
    r: base.r,
    g: base.g,
    b: base.b,
    alpha: Math.max(base.alpha, lift),
    size: base.size * (1 + 0.45 * lift),
    shape: base.shape,
    act: Math.max(base.act, 0.95 * lift),
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

// ---------------------------------------------------------------------------
// Propagation — un événement n'allume pas UN nœud, il traverse son voisinage
// ---------------------------------------------------------------------------

/** Délai d'un saut, ms. En dessous de ~70 ms, l'onde se lit comme un clignotement. */
export const PROPAGATION_STEP_MS = 90
/** Nombre de sauts au-delà du nœud touché. */
export const PROPAGATION_HOPS = 3
/**
 * Plafond du nombre de nœuds atteints par une onde. SANS lui, un événement sur un hub
 * de 5 000 liens planifierait 5 000 impulsions : le coût par image de `PulseClock.tick`
 * (un parcours de la table) et des écritures `updateStyleAt` exploserait pour une
 * animation que personne ne peut lire. 240 nœuds = onde visible, coût borné.
 */
export const PROPAGATION_MAX = 240

export interface PropagationHit {
  /** Id du nœud atteint. */
  readonly id: string
  /** Distance en sauts depuis la graine (1 = voisin direct). */
  readonly hops: number
}

/**
 * Plan d'onde depuis un nœud : parcours en largeur borné (sauts ET nœuds), dans un
 * ordre déterministe. Pur : il ne touche ni au temps ni au rendu, il rend la LISTE des
 * nœuds à réveiller et le saut auquel ils le sont. L'appelant décale chaque impulsion
 * de `hops × PROPAGATION_STEP_MS` — la forme d'onde est celle de `pulseEnvelope`.
 */
export function propagationPlan(
  seedId: string,
  neighboursOf: (id: string) => readonly string[],
  maxHops: number = PROPAGATION_HOPS,
  maxNodes: number = PROPAGATION_MAX,
): PropagationHit[] {
  const seen = new Set<string>([seedId])
  const out: PropagationHit[] = []
  let frontier: string[] = [seedId]
  for (let hop = 1; hop <= maxHops && frontier.length && out.length < maxNodes; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of neighboursOf(id)) {
        if (!nb || seen.has(nb)) continue
        seen.add(nb)
        out.push({ id: nb, hops: hop })
        next.push(nb)
        if (out.length >= maxNodes) break
      }
      if (out.length >= maxNodes) break
    }
    frontier = next
  }
  return out
}
