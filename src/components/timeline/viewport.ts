/**
 * The visible window of a trace, as data: zoom, pan, pinch, follow, and the
 * ticks of the ruler.
 *
 * Pure: every function takes a view and returns a new one, never touches the
 * DOM. A view is a window `[x0, x1]` on the COMPRESSED axis of `axis.ts`
 * (cut silences included), so zooming in a stretch is linear and a cut stays a
 * cut at any zoom level.
 */
import { toT, type Axis, type AxisBreak } from './axis'

export interface View {
  x0: number
  x1: number
}

/** The narrowest window: 20 ms across the whole track. */
export const MIN_VIEW_MS = 20
/** One step of W/S, of a zoom button, of a wheel notch. */
export const ZOOM_STEP = 1.5
/** One step of A/D or of an arrow on the minimap: a fifth of the window. */
export const PAN_STEP = 0.2

const NICE_STEPS_MS = [
  1, 2, 5, 10, 20, 50, 100, 200, 250, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000,
]

export function fitView(total: number): View {
  return { x0: 0, x1: total }
}

/** Keep a view inside `[0, total]` and no narrower than `MIN_VIEW_MS` (or the whole axis, if it is shorter). */
export function clampView(view: View, total: number): View {
  const minWidth = Math.min(MIN_VIEW_MS, total)
  let width = Math.min(Math.max(view.x1 - view.x0, minWidth), total)
  if (!Number.isFinite(width)) width = total
  let x0 = Number.isFinite(view.x0) ? view.x0 : 0
  x0 = Math.min(Math.max(x0, 0), total - width)
  return { x0, x1: x0 + width }
}

/**
 * Zoom by `factor` (> 1 zooms in) around `anchor`, a fraction of the track
 * width (0 = left edge, 1 = right edge): the time under the anchor stays put.
 */
export function zoomView(view: View, factor: number, anchor: number, total: number): View {
  const width = view.x1 - view.x0
  const next = width / factor
  const a = Math.min(Math.max(anchor, 0), 1)
  return clampView({ x0: view.x0 + a * (width - next), x1: view.x0 + a * (width - next) + next }, total)
}

/** Move the window by `fraction` of its width (positive: later). */
export function panView(view: View, fraction: number, total: number): View {
  const shift = (view.x1 - view.x0) * fraction
  return clampView({ x0: view.x0 + shift, x1: view.x1 + shift }, total)
}

/** A drag of `dxPx` pixels on a track `widthPx` wide: the content follows the pointer. */
export function dragView(view: View, dxPx: number, widthPx: number, total: number): View {
  return widthPx > 0 ? panView(view, -dxPx / widthPx, total) : view
}

/** Frame `[x0, x1]` with a margin of `pad` of its width on each side. */
export function focusView(x0: number, x1: number, total: number, pad = 0.08): View {
  const width = Math.max(x1 - x0, MIN_VIEW_MS)
  const centre = (x0 + x1) / 2
  const framed = width * (1 + 2 * pad)
  return clampView({ x0: centre - framed / 2, x1: centre + framed / 2 }, total)
}

/** Centre the window on `x`, same width (a click on the minimap). */
export function centreView(view: View, x: number, total: number): View {
  const half = (view.x1 - view.x0) / 2
  return clampView({ x0: x - half, x1: x + half }, total)
}

/**
 * Two fingers: the points of the axis that were under them when the gesture
 * started stay under them. `from` and `to` are the finger positions in pixels
 * on a track `widthPx` wide, at the start and now; `start` is the view at the start.
 */
export function pinchView(
  start: View,
  from: readonly [number, number],
  to: readonly [number, number],
  widthPx: number,
  total: number,
): View {
  const fromGap = Math.abs(from[1] - from[0])
  const toGap = Math.abs(to[1] - to[0])
  const width = start.x1 - start.x0
  if (widthPx <= 0 || fromGap < 1 || toGap < 1) {
    // One finger, or two on top of each other: a pan of the midpoint.
    return dragView(start, (to[0] + to[1]) / 2 - (from[0] + from[1]) / 2, widthPx, total)
  }
  const next = width * (fromGap / toGap)
  // The time under the left finger at the start…
  const anchor = start.x0 + (Math.min(from[0], from[1]) / widthPx) * width
  // …is under the left finger now.
  const x0 = anchor - (Math.min(to[0], to[1]) / widthPx) * next
  return clampView({ x0, x1: x0 + next }, total)
}

/** Live follow: same width, right edge on the end of the axis. */
export function followView(view: View, total: number): View {
  const width = view.x1 - view.x0
  return clampView({ x0: total - width, x1: total }, total)
}

/** Whether the window shows the whole axis. */
export function isFit(view: View, total: number): boolean {
  return view.x0 <= 0.5 && view.x1 >= total - 0.5
}

/** Position of `x` in the window, in percent of the track (may fall outside 0–100). */
export function viewPct(view: View, x: number): number {
  const width = view.x1 - view.x0
  return width > 0 ? ((x - view.x0) / width) * 100 : 0
}

export interface Tick {
  /** Percent of the track. */
  pct: number
  /** Real time (epoch ms). */
  t: number
  /** Real time since the first event. */
  offsetMs: number
}

/** The smallest round step that keeps labels `minGapPx` apart on a track `widthPx` wide showing `widthMs`. */
export function tickStep(widthMs: number, widthPx: number, minGapPx = 80): number {
  const wanted = widthPx > 0 ? (widthMs * minGapPx) / widthPx : widthMs
  return NICE_STEPS_MS.find((s) => s >= wanted) ?? (NICE_STEPS_MS[NICE_STEPS_MS.length - 1] as number)
}

/**
 * Ticks for a window: round multiples of `tickStep` since the first event,
 * inside each stretch that is in view, plus the start of each stretch (after a
 * cut, the real offset is not round). Labels never sit closer than `minGapPx`.
 */
export function ticksFor(axis: Axis, view: View, widthPx: number, minGapPx = 80): { step: number; ticks: Tick[] } {
  const step = tickStep(view.x1 - view.x0, widthPx, minGapPx)
  const pxPer = widthPx / Math.max(view.x1 - view.x0, 1e-9)
  const candidates: Array<{ x: number; t: number }> = []
  axis.segments.forEach((seg, i) => {
    const last = i === axis.segments.length - 1
    const len = last ? axis.total - seg.at : seg.to - seg.from
    const lo = Math.max(view.x0, seg.at)
    const hi = Math.min(view.x1, seg.at + len)
    if (hi < lo) return
    if (seg.at >= view.x0 && seg.at <= view.x1) candidates.push({ x: seg.at, t: seg.from })
    const tFrom = seg.from + (lo - seg.at)
    const tTo = seg.from + (hi - seg.at)
    const k0 = Math.ceil((tFrom - axis.first) / step)
    const k1 = Math.floor((tTo - axis.first) / step)
    for (let k = k0; k <= k1 && k - k0 < 400; k += 1) {
      const t = axis.first + k * step
      candidates.push({ x: seg.at + (t - seg.from), t })
    }
  })
  candidates.sort((a, b) => a.x - b.x)
  const ticks: Tick[] = []
  let lastX = -Infinity
  for (const c of candidates) {
    if ((c.x - lastX) * pxPer < minGapPx * 0.75) continue
    lastX = c.x
    ticks.push({ pct: viewPct(view, c.x), t: c.t, offsetMs: c.t - axis.first })
  }
  return { step, ticks }
}

/** The cuts of the axis that fall in the window, in percent of the track. */
export function breaksIn(axis: Axis, view: View): Array<AxisBreak & { leftPct: number; widthPct: number }> {
  return axis.breaks
    .filter((b) => b.at + b.width >= view.x0 && b.at <= view.x1)
    .map((b) => ({ ...b, leftPct: viewPct(view, b.at), widthPct: viewPct(view, b.at + b.width) - viewPct(view, b.at) }))
}

/** Real time under a point of the track (`fraction` of its width). */
export function timeAt(axis: Axis, view: View, fraction: number): number {
  return toT(axis, view.x0 + fraction * (view.x1 - view.x0))
}

/**
 * An offset on the ruler: `+250 ms`, `+1.25 s`, `+2 m 05 s`, `+1 h 05 m`, with
 * as many digits as the step needs and no more.
 */
export function formatOffset(ms: number, stepMs: number): string {
  const sign = ms < 0 ? '−' : '+'
  const v = Math.abs(ms)
  if (v < 1000 && stepMs < 1000) return `${sign}${Math.round(v)} ms`
  if (v < 60_000) {
    const digits = stepMs < 10 ? 3 : stepMs < 100 ? 2 : stepMs < 1000 ? 1 : 0
    return `${sign}${(v / 1000).toFixed(digits)} s`
  }
  const totalS = Math.round(v / 1000)
  if (v < 3_600_000) {
    const m = Math.floor(totalS / 60)
    const s = totalS % 60
    return stepMs >= 60_000 ? `${sign}${m} m` : `${sign}${m} m ${String(s).padStart(2, '0')} s`
  }
  const h = Math.floor(totalS / 3600)
  const m = Math.floor((totalS % 3600) / 60)
  const hm = `${sign}${h} h ${String(m).padStart(2, '0')} m`
  return stepMs >= 60_000 ? hm : `${hm} ${String(totalS % 60).padStart(2, '0')} s`
}

/** Wall-clock time with milliseconds, in the reader's language (`<html lang>`), e.g. `14:03:27.418`. */
export function formatClock(t: number, locale?: string): string {
  const lang = locale ?? (typeof document !== 'undefined' ? document.documentElement.lang || undefined : undefined)
  try {
    return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false } as Intl.DateTimeFormatOptions).format(t)
  } catch {
    return new Date(t).toISOString().slice(11, 23)
  }
}
