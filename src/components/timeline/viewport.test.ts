import { describe, expect, it } from 'vitest'
import { buildAxis, toT, toX } from './axis'
import {
  MIN_VIEW_MS, breaksIn, centreView, clampView, dragView, fitView, focusView, followView, formatOffset, isFit, panView,
  pinchView, tickStep, ticksFor, timeAt, viewPct, zoomView,
} from './viewport'

const T0 = 1_700_000_000_000
const HOUR = 3_600_000

describe('axis', () => {
  it('maps time to the compressed axis and back, through a cut silence', () => {
    const axis = buildAxis([[T0, T0 + 2000], [T0 + HOUR, T0 + HOUR + 1000]])!
    expect(axis.breaks).toHaveLength(1)
    expect(axis.breaks[0]!.ms).toBe(HOUR - 2000)
    expect(axis.total).toBe(2000 + 4000 + 1000)
    expect(toX(axis, T0 + 1000)).toBe(1000)
    expect(toX(axis, T0 + HOUR + 500)).toBe(6500)
    for (const t of [T0, T0 + 1500, T0 + 2000 + (HOUR - 2000) / 2, T0 + HOUR, T0 + HOUR + 999]) {
      expect(toT(axis, toX(axis, t))).toBeCloseTo(t, 3)
    }
  })

  it('clamps a time after the last event (a wait still open) to the end of the active part', () => {
    const axis = buildAxis([[T0, T0 + 5000]])!
    expect(toX(axis, T0 + HOUR)).toBe(5000)
    expect(toX(axis, T0 - 10)).toBe(0)
  })

  it('has no axis without intervals', () => {
    expect(buildAxis([])).toBeNull()
  })
})

describe('zoom and pan', () => {
  const total = 10_000

  it('zooms around the anchor: the time under the pointer stays put', () => {
    const v = zoomView(fitView(total), 2, 0.25, total)
    expect(v.x1 - v.x0).toBeCloseTo(5000)
    // Before: 25 % of the track was 2500 ms; after, still 2500 ms.
    expect(v.x0 + 0.25 * (v.x1 - v.x0)).toBeCloseTo(2500)
  })

  it('never zooms out past the whole axis nor in below the minimum width', () => {
    expect(zoomView(fitView(total), 0.1, 0.5, total)).toEqual({ x0: 0, x1: total })
    const deep = zoomView(fitView(total), 1e9, 0.5, total)
    expect(deep.x1 - deep.x0).toBe(MIN_VIEW_MS)
  })

  it('pans by a fraction of the window and stops at the edges', () => {
    const v = { x0: 2000, x1: 4000 }
    expect(panView(v, 0.5, total)).toEqual({ x0: 3000, x1: 5000 })
    expect(panView(v, -5, total)).toEqual({ x0: 0, x1: 2000 })
    expect(panView(v, 50, total)).toEqual({ x0: 8000, x1: 10_000 })
  })

  it('drags with the pointer: content follows the hand', () => {
    // Dragging 100 px right on a 1000 px track showing 2000 ms moves the window 200 ms earlier.
    expect(dragView({ x0: 4000, x1: 6000 }, 100, 1000, total)).toEqual({ x0: 3800, x1: 5800 })
  })

  it('pinches: the points under the two fingers stay under them', () => {
    const start = { x0: 0, x1: 10_000 }
    // Fingers at 200 and 400 px of 1000 px (2000 ms and 4000 ms) spread to 100 and 500 px.
    const v = pinchView(start, [200, 400], [100, 500], 1000, total)
    const at = (px: number) => v.x0 + (px / 1000) * (v.x1 - v.x0)
    expect(at(100)).toBeCloseTo(2000)
    expect(at(500)).toBeCloseTo(4000)
    expect(v.x1 - v.x0).toBeCloseTo(5000)
  })

  it('a pinch with the fingers together is a pan', () => {
    expect(pinchView({ x0: 4000, x1: 6000 }, [500, 500], [600, 600], 1000, total)).toEqual({ x0: 3800, x1: 5800 })
  })

  it('frames a span with a margin, centres, follows the end', () => {
    const f = focusView(1000, 2000, total, 0.1)
    expect(f.x0).toBeCloseTo(900)
    expect(f.x1).toBeCloseTo(2100)
    expect(centreView({ x0: 0, x1: 2000 }, 5000, total)).toEqual({ x0: 4000, x1: 6000 })
    expect(followView({ x0: 1000, x1: 3000 }, 12_000)).toEqual({ x0: 10_000, x1: 12_000 })
    expect(isFit(fitView(total), total)).toBe(true)
    expect(isFit({ x0: 1, x1: 50 }, total)).toBe(false)
  })

  it('repairs a broken view instead of drawing nothing', () => {
    expect(clampView({ x0: Number.NaN, x1: Number.NaN }, total)).toEqual({ x0: 0, x1: total })
  })

  it('places a point of the axis in the window, and reads the time under the pointer', () => {
    const axis = buildAxis([[T0, T0 + 10_000]])!
    const v = { x0: 2000, x1: 4000 }
    expect(viewPct(v, 3000)).toBe(50)
    expect(viewPct(v, 1000)).toBe(-50)
    expect(timeAt(axis, v, 0.5)).toBe(T0 + 3000)
  })
})

describe('ruler', () => {
  it('picks the smallest round step that keeps labels apart', () => {
    expect(tickStep(10_000, 1000, 80)).toBe(1000)
    expect(tickStep(1000, 1000, 80)).toBe(100)
    expect(tickStep(60, 1000, 80)).toBe(5)
    expect(tickStep(6 * HOUR, 800, 80)).toBe(HOUR)
  })

  it('labels ticks in time since the first event and never crowds them', () => {
    const axis = buildAxis([[T0, T0 + 10_000]])!
    const { step, ticks } = ticksFor(axis, fitView(axis.total), 1000)
    expect(step).toBe(1000)
    expect(ticks.map((t) => t.offsetMs)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000])
    for (let i = 1; i < ticks.length; i += 1) expect(ticks[i]!.pct - ticks[i - 1]!.pct).toBeGreaterThanOrEqual(6)
  })

  it('after a cut, starts the next stretch with its real offset and shows the cut', () => {
    const axis = buildAxis([[T0, T0 + 2000], [T0 + HOUR, T0 + HOUR + 2000]])!
    const view = fitView(axis.total)
    const { ticks } = ticksFor(axis, view, 1000)
    expect(ticks.some((t) => t.offsetMs === HOUR)).toBe(true)
    const cuts = breaksIn(axis, view)
    expect(cuts).toHaveLength(1)
    expect(cuts[0]!.ms).toBe(HOUR - 2000)
    expect(cuts[0]!.leftPct).toBeCloseTo(25)
    // Zoomed on the first stretch: the cut is out of view.
    expect(breaksIn(axis, { x0: 0, x1: 1000 })).toHaveLength(0)
  })

  it('writes offsets with as many digits as the step needs', () => {
    expect(formatOffset(250, 50)).toBe('+250 ms')
    expect(formatOffset(1200, 100)).toBe('+1.2 s')
    expect(formatOffset(1250, 50)).toBe('+1.25 s')
    expect(formatOffset(3000, 1000)).toBe('+3 s')
    expect(formatOffset(125_000, 5000)).toBe('+2 m 05 s')
    expect(formatOffset(120_000, 60_000)).toBe('+2 m')
    expect(formatOffset(HOUR + 5 * 60_000, HOUR)).toBe('+1 h 05 m')
    expect(formatOffset(HOUR + 5 * 60_000 + 30_000, 30_000)).toBe('+1 h 05 m 30 s')
  })
})
