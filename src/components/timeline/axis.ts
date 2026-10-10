/**
 * The time axis of a trace, as data.
 *
 * Pure: no DOM, no clock. Real time (epoch ms) maps to a position on a
 * COMPRESSED axis (also in ms): linear wherever something happens, and a
 * silence longer than `gapMs` is cut down to `gapWidthMs`. A conversation left
 * overnight would otherwise squeeze every call of the morning into one pixel.
 * The cut is kept as a break that knows its real length, so the view can say it.
 *
 * Both directions are exact: `toX` and `toT` are inverses (a time inside a cut
 * maps linearly onto the break's width), which is what zoom, pan and the hover
 * read-out need.
 */

/** A silence longer than this is cut. */
export const GAP_MS = 30_000
/** What a cut silence is worth on the axis, in ms of active time. */
export const GAP_WIDTH_MS = 4_000
/** The axis never spans less than this, so one instant is not a full-width line. */
export const MIN_SPAN_MS = 1_000

export interface AxisSegment {
  /** Real start and end (epoch ms) of a stretch where something happens. */
  from: number
  to: number
  /** Where it starts on the compressed axis. */
  at: number
}

export interface AxisBreak {
  /** Where the break starts on the compressed axis, and how wide it is drawn. */
  at: number
  width: number
  /** The real silence that was cut. */
  from: number
  to: number
  ms: number
}

export interface Axis {
  segments: AxisSegment[]
  breaks: AxisBreak[]
  /** Length of the compressed axis. */
  total: number
  /** Real time of the first and last event. */
  first: number
  last: number
}

/** Merge intervals closer than `gapMs` into stretches and lay them end to end, cutting the silences between them. */
export function buildAxis(
  intervals: ReadonlyArray<readonly [number, number]>,
  gapMs: number = GAP_MS,
  gapWidthMs: number = GAP_WIDTH_MS,
): Axis | null {
  if (intervals.length === 0) return null
  const sorted = intervals.map(([a, b]) => [a, Math.max(a, b)] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const stretches: Array<{ from: number; to: number }> = []
  for (const [from, to] of sorted) {
    const last = stretches[stretches.length - 1]
    if (last && from - last.to <= gapMs) last.to = Math.max(last.to, to)
    else stretches.push({ from, to })
  }
  const segments: AxisSegment[] = []
  const breaks: AxisBreak[] = []
  let width = 0
  stretches.forEach((s, i) => {
    if (i > 0) {
      const prev = stretches[i - 1] as { to: number }
      breaks.push({ at: width, width: gapWidthMs, from: prev.to, to: s.from, ms: s.from - prev.to })
      width += gapWidthMs
    }
    segments.push({ from: s.from, to: s.to, at: width })
    width += s.to - s.from
  })
  const first = (stretches[0] as { from: number }).from
  const last = (stretches[stretches.length - 1] as { to: number }).to
  return { segments, breaks, total: Math.max(width, MIN_SPAN_MS), first, last }
}

/** Index of the last segment that starts at or before `t` (binary search), -1 before the first. */
function segmentAt(axis: Axis, t: number): number {
  let lo = 0
  let hi = axis.segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if ((axis.segments[mid] as AxisSegment).from <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Real time → position on the compressed axis. Before the first event: 0; after the last: the end of the active part. */
export function toX(axis: Axis, t: number): number {
  const i = segmentAt(axis, t)
  if (i < 0) return 0
  const seg = axis.segments[i] as AxisSegment
  if (t <= seg.to) return seg.at + (t - seg.from)
  const brk = axis.breaks[i]
  // After the last stretch: clamp (a wait still open is drawn up to the edge, it does not stretch the axis).
  if (!brk) return seg.at + (seg.to - seg.from)
  return brk.at + ((t - brk.from) / Math.max(brk.ms, 1)) * brk.width
}

/** Position on the compressed axis → real time. The inverse of `toX`. */
export function toT(axis: Axis, x: number): number {
  for (let i = axis.segments.length - 1; i >= 0; i -= 1) {
    const seg = axis.segments[i] as AxisSegment
    if (x >= seg.at) return seg.from + (x - seg.at)
    const brk = axis.breaks[i - 1]
    if (brk && x >= brk.at) return brk.from + ((x - brk.at) / brk.width) * brk.ms
  }
  return axis.first + x
}
