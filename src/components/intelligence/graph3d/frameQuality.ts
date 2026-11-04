// ============================================================================
// frameQuality — the frame budget that sets the renderer's pixel ratio
// ============================================================================
//
// WHY
//   The 3D graph is a points cloud: its cost is almost entirely fragments, so
//   the pixel ratio IS the quality knob. A hard cap (`MAX_PIXEL_RATIO`, 1.5) is
//   the wrong shape of answer — it is too expensive for an integrated GPU and
//   needlessly cheap for a discrete one, and nothing in between. po-graph does
//   better (po-graph.js:4186): it measures the real inter-frame interval and
//   moves the ratio in 0.5 steps, with a drop counter that stops the loop from
//   oscillating forever.
//
// THIS FILE IS PURE. No DOM, no requestAnimationFrame, no three.js. The hook
// (useRenderLoop) feeds it one sample per rendered frame and applies whatever
// ratio comes back; everything that decides is testable without a canvas.
//
// THE RULES, copied from po-graph's `S.ema` / `S.slowN` / `S.fastN` /`S.prDrops`
//   * interval averaged with an EMA (α = 0.1) — one slow frame must not count;
//   * slow  = EMA > 34 ms  for MORE THAN 90 consecutive frames  → ratio −0.5,
//     floor 1. 34 ms is the first interval a user perceives as a stutter
//     (~29 fps); 90 frames is ~1.5 s, long enough to outlast a zoom tween, an
//     image decode or a GC pause.
//   * fast  = EMA < 12 ms  for MORE THAN 600 consecutive frames → ratio +0.5,
//     capped at the device's own ratio. 12 ms is what 60 fps (16.7 ms) never
//     reaches — except on a machine that is fast enough that the graph is cheap.
//   * AT MOST 2 DROPS: after two, the machine has proved it cannot hold the
//     higher ratio, so we stop climbing back. Without this the ratio ping-pongs
//     at ~0.2 Hz, which is worse than being slightly blurry.
//   * COOLDOWNS — 4 s after a drop, 15 s after a raise — so a resize, a
//     relayout or a burst of activations cannot drive a decision on its own.

import type { TierBudget } from './deviceTier'

/** EMA above which a frame counts as slow (≈29 fps). */
export const SLOW_FRAME_MS = 34
/** EMA below which a frame counts as fast (12 ms; 60 fps is 16.7 ms). */
export const FAST_FRAME_MS = 12
/** Consecutive slow frames needed before dropping (≈1.5 s at 60 fps). */
export const SLOW_FRAMES = 90
/** Consecutive fast frames needed before raising (≈10 s at 60 fps). */
export const FAST_FRAMES = 600
/** Step applied to the pixel ratio, both ways. */
export const RATIO_STEP = 0.5
/** Never go below this ratio: below 1 the image is upscaled and looks worse. */
export const MIN_PIXEL_RATIO = 1
/** After this many drops, no more raises (po-graph's `prDrops < 2`). */
export const MAX_DROPS_BEFORE_NO_RAISE = 2
/** Minimum time between two drops. */
export const DROP_COOLDOWN_MS = 4000
/** Minimum time between two raises. */
export const RAISE_COOLDOWN_MS = 15000
/**
 * Lowest share of the tier's link budget the governor may fall to. Each slow
 * episode at the minimum pixel ratio halves it: 1 → ½ → ¼.
 */
export const MIN_LINK_SCALE = 0.25
/** EMA smoothing factor; 0.1 is po-graph's `S.ema * .9 + dt * .1`. */
export const EMA_ALPHA = 0.1
/** A gap beyond this is a stall (hidden tab, GC, breakpoint), not a frame. */
export const MAX_PLAUSIBLE_FRAME_MS = 1000

const EPS = 1e-6

export interface FrameQualityState {
  /** Pixel ratio currently in force (renderer + shader `uPx`). */
  ratio: number
  /**
   * Share (MIN_LINK_SCALE..1) of the tier's link budget in force — the second
   * lever, used once the pixel ratio is at its floor (see linkBudgetFor).
   */
  linkScale: number
  /** How many times the link budget has been lowered. */
  linkDrops: number
  /** How many times the ratio has been dropped since this state was created. */
  drops: number
  /** Consecutive samples above `SLOW_FRAME_MS`. */
  slowFrames: number
  /** Consecutive samples below `FAST_FRAME_MS`. */
  fastFrames: number
  /** `performance.now()` of the last ratio change (cooldown reference). */
  changedAt: number
  /** Smoothed inter-frame interval, in ms. */
  emaMs: number
  /** False until a first plausible sample has seeded the EMA. */
  emaSeeded: boolean
  /** `performance.now()` of the last accepted sample; 0 = "resumed, re-seed". */
  lastFrameAt: number
}

/** Fresh state, at `ratio`, with the cooldown clock started at `now`. */
export function initialFrameQuality(ratio: number, now = 0): FrameQualityState {
  return {
    ratio,
    linkScale: 1,
    linkDrops: 0,
    drops: 0,
    slowFrames: 0,
    fastFrames: 0,
    changedAt: now,
    emaMs: 0,
    emaSeeded: false,
    lastFrameAt: 0,
  }
}

export interface FrameSample {
  /** Interval since the previous frame, in ms. */
  dtMs: number
  /** `performance.now()` for this frame. */
  now: number
  /** Ceiling: the device's own ratio, clamped by the caller. */
  maxRatio: number
}

/** Round to 2 decimals so 1.5 − 0.5 is 1 and not 0.9999999999999999. */
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Fold one frame into the state and return the next one.
 *
 * Immutable on purpose: the whole decision is then a value a test can assert on
 * without a hook, a clock or a canvas. The cost is one small object per frame,
 * which is nothing next to the frame itself.
 */
export function observeFrame(state: FrameQualityState, sample: FrameSample): FrameQualityState {
  const dt = sample.dtMs
  // First frame after a resume, a hidden tab, a debugger pause or a GC storm:
  // the gap measures the pause, not the cost of a frame. Re-seed instead.
  if (state.lastFrameAt === 0 || !(dt > 0) || dt > MAX_PLAUSIBLE_FRAME_MS) {
    return {
      ...state,
      lastFrameAt: sample.now,
      emaSeeded: false,
      emaMs: 0,
      slowFrames: 0,
      fastFrames: 0,
    }
  }

  const emaMs = state.emaSeeded ? state.emaMs * (1 - EMA_ALPHA) + dt * EMA_ALPHA : dt
  const slowFrames = emaMs > SLOW_FRAME_MS ? state.slowFrames + 1 : 0
  const fastFrames = emaMs < FAST_FRAME_MS ? state.fastFrames + 1 : 0
  const maxRatio = Math.max(MIN_PIXEL_RATIO, sample.maxRatio)
  const sinceChange = sample.now - state.changedAt

  // ── Drop: the machine cannot hold this ratio ──────────────────────────────
  if (
    slowFrames > SLOW_FRAMES
    && state.ratio > MIN_PIXEL_RATIO + EPS
    && sinceChange >= DROP_COOLDOWN_MS
  ) {
    return {
      ...state,
      ratio: Math.max(MIN_PIXEL_RATIO, round2(state.ratio - RATIO_STEP)),
      drops: state.drops + 1,
      emaMs: 0,
      emaSeeded: false,
      slowFrames: 0,
      fastFrames: 0,
      changedAt: sample.now,
      lastFrameAt: sample.now,
    }
  }

  // ── Second lever: the pixel ratio is at its floor, lower the link budget ──
  if (
    slowFrames > SLOW_FRAMES
    && state.ratio <= MIN_PIXEL_RATIO + EPS
    && state.linkScale > MIN_LINK_SCALE + EPS
    && sinceChange >= DROP_COOLDOWN_MS
  ) {
    return {
      ...state,
      linkScale: Math.max(MIN_LINK_SCALE, state.linkScale / 2),
      linkDrops: state.linkDrops + 1,
      emaMs: 0,
      emaSeeded: false,
      slowFrames: 0,
      fastFrames: 0,
      changedAt: sample.now,
      lastFrameAt: sample.now,
    }
  }

  // ── Raise the link budget back first: it was the last thing lowered ───────
  if (
    fastFrames > FAST_FRAMES
    && state.linkScale < 1 - EPS
    && sinceChange >= RAISE_COOLDOWN_MS
    && state.linkDrops < MAX_DROPS_BEFORE_NO_RAISE
  ) {
    return {
      ...state,
      linkScale: Math.min(1, state.linkScale * 2),
      emaMs: 0,
      emaSeeded: false,
      slowFrames: 0,
      fastFrames: 0,
      changedAt: sample.now,
      lastFrameAt: sample.now,
    }
  }

  // ── Raise: there is headroom, and the machine has not given up already ────
  if (
    fastFrames > FAST_FRAMES
    && state.ratio < maxRatio - EPS
    && sinceChange >= RAISE_COOLDOWN_MS
    && state.drops < MAX_DROPS_BEFORE_NO_RAISE
  ) {
    return {
      ...state,
      ratio: Math.min(maxRatio, round2(state.ratio + RATIO_STEP)),
      emaMs: 0,
      emaSeeded: false,
      slowFrames: 0,
      fastFrames: 0,
      changedAt: sample.now,
      lastFrameAt: sample.now,
    }
  }

  // No decision: still freeze the counters so the caller can read them.
  return { ...state, emaMs, emaSeeded: true, slowFrames, fastFrames, lastFrameAt: sample.now }
}

/**
 * The link-system budget (SystemBudget.maxTriangles / maxCorridors) for a tier
 * at the governor's current `linkScale`.
 */
export function linkBudgetFor(
  tier: Pick<TierBudget, 'maxLinkTriangles' | 'maxLinkBundles'>,
  state: Pick<FrameQualityState, 'linkScale'>,
): { maxTriangles: number; maxCorridors: number } {
  const k = Math.min(1, Math.max(MIN_LINK_SCALE, state.linkScale))
  return {
    maxTriangles: Math.floor(tier.maxLinkTriangles * k),
    maxCorridors: Math.max(1, Math.floor(tier.maxLinkBundles * k)),
  }
}
