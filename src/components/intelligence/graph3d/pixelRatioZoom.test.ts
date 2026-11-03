/**
 * The zoom-adaptive sampling ceiling, tested as a pure function.
 *
 * Each assertion is a failure the user would SEE: a close-up that stayed blurry
 * (the 03/11/2026 complaint), a ceiling that oversampled a 1× screen for nothing,
 * a camera that had not framed anything yet sharpening the overview, or a boost
 * that ignored the device's own ratio.
 */
import { describe, it, expect } from 'vitest'
import {
  ZOOM_FAR_THRESHOLD,
  ZOOM_NEAR_THRESHOLD,
  ZOOM_RATIO_BOOST_MAX,
  ZOOM_RATIO_QUANTUM,
  zoomAdaptivePixelRatioCeiling,
} from './pixelRatioZoom'

const FRAMING = 100
const BASE = 1
const DEVICE = 2

describe('zoomAdaptivePixelRatioCeiling', () => {
  it('leaves the overview at the base ceiling (no boost far away)', () => {
    expect(zoomAdaptivePixelRatioCeiling(FRAMING * ZOOM_FAR_THRESHOLD, FRAMING, BASE, DEVICE)).toBe(BASE)
    expect(zoomAdaptivePixelRatioCeiling(FRAMING * 5, FRAMING, BASE, DEVICE)).toBe(BASE)
  })

  it('keeps the default framing at the base ceiling', () => {
    // The overview sits at the framing distance: it must not pay for a boost.
    expect(zoomAdaptivePixelRatioCeiling(FRAMING, FRAMING, 1.5, DEVICE)).toBe(1.5)
  })

  it('raises the ceiling as the camera comes closer', () => {
    const far = zoomAdaptivePixelRatioCeiling(FRAMING * 0.95, FRAMING, BASE, DEVICE)
    const mid = zoomAdaptivePixelRatioCeiling(FRAMING * 0.7, FRAMING, BASE, DEVICE)
    const near = zoomAdaptivePixelRatioCeiling(FRAMING * ZOOM_NEAR_THRESHOLD, FRAMING, BASE, DEVICE)
    expect(far).toBeLessThan(mid)
    expect(mid).toBeLessThan(near)
    expect(near).toBe(BASE * ZOOM_RATIO_BOOST_MAX)
  })

  it('never samples above the screen own ratio', () => {
    const ceiling = zoomAdaptivePixelRatioCeiling(FRAMING * 0.1, FRAMING, 1.5, 1)
    expect(ceiling).toBe(1)
  })

  it('gives the base ceiling back when nothing has been framed yet', () => {
    expect(zoomAdaptivePixelRatioCeiling(50, 0, BASE, DEVICE)).toBe(BASE)
    expect(zoomAdaptivePixelRatioCeiling(Number.NaN, FRAMING, BASE, DEVICE)).toBe(BASE)
    // A ceiling of 0 means 'no ceiling known': handed back untouched, never invented.
    expect(zoomAdaptivePixelRatioCeiling(50, FRAMING, 0, DEVICE)).toBe(0)
  })

  it('is monotone: closer is never less sharp than further', () => {
    let previous = -Infinity
    for (const ratio of [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25]) {
      const ceiling = zoomAdaptivePixelRatioCeiling(FRAMING * ratio, FRAMING, BASE, DEVICE)
      expect(ceiling).toBeGreaterThanOrEqual(previous)
      previous = ceiling
    }
  })

  it('moves in discrete steps, so a smooth zoom does not resize the canvas every frame', () => {
    const seen = new Set<number>()
    for (let d = FRAMING * 3; d > FRAMING * 0.2; d -= 0.5) {
      const ceiling = zoomAdaptivePixelRatioCeiling(d, FRAMING, 1.5, 2)
      expect(Math.abs(ceiling / ZOOM_RATIO_QUANTUM - Math.round(ceiling / ZOOM_RATIO_QUANTUM))).toBeLessThan(1e-9)
      seen.add(ceiling)
    }
    // 1.5 → 1.75 → 2 (capped by the screen): three ceilings over the whole zoom.
    expect([...seen].sort()).toEqual([1.5, 1.75, 2])
  })
})
