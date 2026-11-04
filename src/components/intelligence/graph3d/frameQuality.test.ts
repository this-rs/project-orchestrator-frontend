/**
 * The frame budget, tested as a pure function.
 *
 * Every assertion here is a failure mode that costs the user something visible:
 * never dropping (a stuttering graph on a weak GPU), dropping too eagerly (a
 * blurry graph on a good one), or raising and dropping in a loop (a graph that
 * pulses between sharp and blurry — worse than either).
 */
import { describe, it, expect } from 'vitest'
import {
  observeFrame,
  initialFrameQuality,
  MAX_DROPS_BEFORE_NO_RAISE,
  MIN_PIXEL_RATIO,
  SLOW_FRAME_MS,
  FAST_FRAME_MS,
  SLOW_FRAMES,
  FAST_FRAMES,
  DROP_COOLDOWN_MS,
  RAISE_COOLDOWN_MS,
  MIN_LINK_SCALE,
  linkBudgetFor,
  type FrameQualityState,
} from './frameQuality'
import { TIER_BUDGETS } from './deviceTier'

/** Feed `n` frames of `dtMs` at 60 fps of wall clock, starting at `t0`. */
function run(state: FrameQualityState, dtMs: number, n: number, startAt = 1000, maxRatio = 1.5) {
  let s = state
  let t = startAt
  for (let i = 0; i < n; i++) {
    t += dtMs
    s = observeFrame(s, { dtMs, now: t, maxRatio })
  }
  return { state: s, now: t }
}

describe('initialFrameQuality', () => {
  it('starts at the given ratio with no history', () => {
    const s = initialFrameQuality(1.5, 42)
    expect(s.ratio).toBe(1.5)
    expect(s.drops).toBe(0)
    expect(s.emaSeeded).toBe(false)
    expect(s.changedAt).toBe(42)
  })
})

describe('observeFrame — seeding', () => {
  it('spends one frame to learn the clock, then seeds the EMA on the next', () => {
    // `lastFrameAt === 0` means "no previous frame" (mount, or a resume), so the
    // first sample only records the timestamp — there is no interval to measure
    // against yet. The second sample seeds the average with its own dt.
    const first = observeFrame(initialFrameQuality(1.5), { dtMs: 16, now: 100, maxRatio: 1.5 })
    expect(first.emaSeeded).toBe(false)
    expect(first.lastFrameAt).toBe(100)
    const second = observeFrame(first, { dtMs: 18, now: 118, maxRatio: 1.5 })
    expect(second.emaMs).toBe(18)
    expect(second.emaSeeded).toBe(true)
  })

  it('ignores the gap that follows a resume', () => {
    // A paused loop restarts with lastFrameAt = 0: the first dt is the pause,
    // not a frame, so it must not be folded into the estimate.
    const paused = { ...initialFrameQuality(1.5), lastFrameAt: 0, emaMs: 16, emaSeeded: true }
    const s = observeFrame(paused, { dtMs: 5000, now: 10_000, maxRatio: 1.5 })
    expect(s.emaMs).toBe(0)
    expect(s.emaSeeded).toBe(false)
    expect(s.ratio).toBe(1.5)
  })

  it('ignores a stall longer than a second even mid-run', () => {
    const s = run(initialFrameQuality(1.5), 16.7, 5).state
    const stalled = observeFrame(s, { dtMs: 4000, now: s.lastFrameAt + 4000, maxRatio: 1.5 })
    expect(stalled.emaSeeded).toBe(false)
    expect(stalled.slowFrames).toBe(0)
    expect(stalled.ratio).toBe(1.5)
  })
})

describe('observeFrame — dropping the ratio', () => {
    const s = run(initialFrameQuality(1.5), 60, 3, 1000).state
    expect(s.ratio).toBe(1.5)
    expect(s.slowFrames).toBe(2)

  it('keeps the ratio while the EMA is between 12 and 34 ms', () => {
    const { state } = run(initialFrameQuality(1.5), 20, 600)
    expect(state.ratio).toBe(1.5)
    expect(state.slowFrames).toBe(0)
    expect(state.fastFrames).toBe(0)
  })

  it('drops by 0.5 once the EMA stays above 34 ms for more than 90 frames', () => {
    const warm = initialFrameQuality(1.5, 0)
    const { state } = run(warm, 50, SLOW_FRAMES + 2, DROP_COOLDOWN_MS)
    expect(state.ratio).toBe(1)
    expect(state.drops).toBe(1)
  })

  it('never goes below 1', () => {
    let s = initialFrameQuality(1, 0)
    const { state } = run(s, 50, SLOW_FRAMES * 4, DROP_COOLDOWN_MS)
    s = state
    expect(s.ratio).toBe(MIN_PIXEL_RATIO)
    expect(s.drops).toBe(0)
  })

  it('honours the cooldown: a fast relayout right after a drop cannot drop again', () => {
    const dropped = run(initialFrameQuality(1.5, 0), 50, SLOW_FRAMES + 2, DROP_COOLDOWN_MS).state
    expect(dropped.ratio).toBe(1)
    // Slow again immediately, but the cooldown has not elapsed.
    const { state } = run(dropped, 50, SLOW_FRAMES + 10, dropped.changedAt + 10)
    expect(state.ratio).toBe(1)
  })
})

describe('observeFrame — raising the ratio', () => {
  it('raises back after a long cheap window', () => {
    const dropped = run(initialFrameQuality(1.5, 0), 50, SLOW_FRAMES + 2, DROP_COOLDOWN_MS).state
    const { state } = run(dropped, 8, FAST_FRAMES + 2, dropped.changedAt + RAISE_COOLDOWN_MS)
    expect(state.ratio).toBe(1.5)
    expect(state.drops).toBe(1)
  })

  it('never raises above the device ratio', () => {
    const { state } = run(initialFrameQuality(1.25, 0), 8, FAST_FRAMES + 2, RAISE_COOLDOWN_MS, 1.25)
    expect(state.ratio).toBe(1.25)
    // Even with a generous ceiling it can only reach the ceiling, never past it.
    const capped = run({ ...initialFrameQuality(1, 0) }, 8, FAST_FRAMES + 2, RAISE_COOLDOWN_MS, 1.25)
    expect(capped.state.ratio).toBe(1.25)
  })

  it('stops climbing back after two drops (no ping-pong)', () => {
    // Drop twice: 1.5 → 1.0 → 1.0 (floor) — so force a third attempt with a
    // state that still has room, and check the guard itself.
    let s = initialFrameQuality(1.5, 0)
    s = run(s, 50, SLOW_FRAMES + 2, DROP_COOLDOWN_MS).state        // → 1.0, drops 1
    s = { ...s, ratio: 1.5, drops: MAX_DROPS_BEFORE_NO_RAISE }      // pretend it fell twice
    const { state } = run(s, 8, FAST_FRAMES + 4, s.changedAt + RAISE_COOLDOWN_MS)
    expect(state.ratio).toBe(1.5)
    expect(state.drops).toBe(MAX_DROPS_BEFORE_NO_RAISE)
    expect(state.fastFrames).toBeGreaterThan(FAST_FRAMES)
  })

  it('does not raise on a merely-fine window (16.7 ms at 60 fps)', () => {
    const { state } = run(initialFrameQuality(1, 0), 16.7, FAST_FRAMES + 100, RAISE_COOLDOWN_MS)
    expect(state.ratio).toBe(1)
  })
})

describe('observeFrame — thresholds', () => {
  it('exposes the documented thresholds', () => {
    expect(SLOW_FRAME_MS).toBe(34)
    expect(FAST_FRAME_MS).toBe(12)
    expect(SLOW_FRAMES).toBe(90)
    expect(FAST_FRAMES).toBe(600)
  })

  it('does not decide before its window is filled', () => {
    // Exactly SLOW_FRAMES slow frames: the counter has to EXCEED the window.
    const { state } = run(initialFrameQuality(1.5, 0), 50, SLOW_FRAMES, DROP_COOLDOWN_MS)
    expect(state.ratio).toBe(1.5)
  })
})

describe('the link budget: the governor’s second lever', () => {
  // medium and low tiers already open at maxPixelRatio 1.0: the ratio has
  // nowhere to go, so a slow frame used to change nothing at all.
  it('at ratio 1, sustained slow frames halve the link budget, down to its floor', () => {
    let s = initialFrameQuality(1, 0)
    expect(s.linkScale).toBe(1)
    let t = 1000
    const scales: number[] = []
    for (let k = 0; k < 4; k++) {
      const r = run(s, 50, SLOW_FRAMES + 2, t + DROP_COOLDOWN_MS)
      s = r.state
      t = r.now
      scales.push(s.linkScale)
    }
    expect(s.ratio).toBe(MIN_PIXEL_RATIO)
    expect(scales).toEqual([0.5, MIN_LINK_SCALE, MIN_LINK_SCALE, MIN_LINK_SCALE])
  })

  it('drops the pixel ratio first, then the link budget', () => {
    let s = initialFrameQuality(1.5, 0)
    s = run(s, 50, SLOW_FRAMES + 2, DROP_COOLDOWN_MS).state
    expect([s.ratio, s.linkScale]).toEqual([1, 1])
    s = run(s, 50, SLOW_FRAMES + 2, s.changedAt + DROP_COOLDOWN_MS).state
    expect([s.ratio, s.linkScale]).toEqual([1, 0.5])
  })

  it('gives the link budget back first when the frames are fast again', () => {
    const slow = { ...initialFrameQuality(1, 0), linkScale: 0.5 }
    const { state } = run(slow, 8, FAST_FRAMES + 2, RAISE_COOLDOWN_MS, 1.5)
    expect(state.linkScale).toBe(1)
    expect(state.ratio).toBe(1)
  })

  it('turns the scale into a budget for the link system', () => {
    const b = linkBudgetFor(TIER_BUDGETS.medium, { linkScale: 0.5 })
    expect(b.maxTriangles).toBe(TIER_BUDGETS.medium.maxLinkTriangles / 2)
    expect(b.maxCorridors).toBe(TIER_BUDGETS.medium.maxLinkBundles / 2)
  })
})
