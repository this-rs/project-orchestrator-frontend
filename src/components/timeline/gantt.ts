/**
 * The geometry of the Gantt, as data.
 *
 * Pure: no DOM, no clock (`now` is a parameter). Given the lanes of a
 * conversation it answers where each call sits on a shared time axis, how many
 * ran at once, and where the axis is cut.
 *
 * The axis is linear inside a stretch where something is happening and CUTS a
 * silence longer than `gapMs` down to a fixed width: a conversation left
 * overnight would otherwise squeeze every call of the morning into one pixel.
 * The cut is drawn (a break, with its real length), never hidden.
 */
import type { TimelineItem, TimelineLane } from './model'

/** A silence longer than this is cut. */
export const GAP_MS = 30_000
/** What a cut silence is worth on the axis, in ms of active time. */
const GAP_WIDTH_MS = 4_000
/** The axis never spans less than this, so one instant is not a full-width line. */
const MIN_SPAN_MS = 1_000
/** Kinds that count as "a call in flight" for the concurrency track. */
const CALL_KINDS: ReadonlySet<TimelineItem['kind']> = new Set(['tool', 'agent', 'run'])
const MAX_DEPTH = 3
const MAX_TICKS = 8
/** Closest two tick labels may sit, in percent of the axis. */
const MIN_TICK_GAP_PCT = 11
const NICE_STEPS_MS = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000]

export interface GanttRow {
  item: TimelineItem
  depth: number
  /** Real epoch ms the bar covers (a running call ends at `now`). */
  start: number
  end: number
  /** The item is a moment, not a stretch: drawn as a mark. */
  instant: boolean
  /** Position on the axis, in percent. */
  leftPct: number
  widthPct: number
}

export interface GanttSection {
  lane: TimelineLane
  rows: GanttRow[]
}

export interface GanttTick {
  pct: number
  /** Real ms since the first event. */
  offsetMs: number
}

export interface GanttBreak {
  pct: number
  /** The real length of the silence that was cut. */
  ms: number
}

export interface GanttConcurrency {
  leftPct: number
  widthPct: number
  n: number
}

export interface GanttLayout {
  sections: GanttSection[]
  ticks: GanttTick[]
  breaks: GanttBreak[]
  concurrency: GanttConcurrency[]
  peak: number
  /** Number of rows over all sections. */
  count: number
  /** Real time from the first event to the last. */
  spanMs: number
}

interface Segment {
  from: number
  to: number
  /** Where this stretch starts on the compressed axis, in ms. */
  at: number
}

/** Where an item's bar ends, in real time. A call still open is drawn up to `now`. */
function endOf(item: TimelineItem, now: number): number {
  if (item.endedAt != null) return Math.max(item.endedAt, item.startedAt)
  if (item.status === 'running' || item.status === 'blocked') return Math.max(now, item.startedAt)
  return item.startedAt
}

function depthOf(item: TimelineItem, byId: ReadonlyMap<string, TimelineItem>): number {
  let depth = 0
  const seen = new Set<string>([item.id])
  let cursor = item.parentId
  while (cursor && depth < MAX_DEPTH && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    depth += 1
    cursor = parent.parentId
  }
  return depth
}

function niceStep(activeMs: number): number {
  const wanted = activeMs / (MAX_TICKS - 2)
  return NICE_STEPS_MS.find((s) => s >= wanted) ?? NICE_STEPS_MS[NICE_STEPS_MS.length - 1]!
}

export function layoutGantt(lanes: ReadonlyArray<TimelineLane>, now: number, gapMs: number = GAP_MS): GanttLayout {
  const filled = lanes.filter((l) => l.items.length > 0)
  const all = filled.flatMap((l) => l.items)
  if (all.length === 0) return { sections: [], ticks: [], breaks: [], concurrency: [], peak: 0, count: 0, spanMs: 0 }
  const byId = new Map(all.map((i) => [i.id, i]))

  // Stretches where something happens: intervals closer than `gapMs` are one stretch.
  // A wait for the reader (a permission nobody answered) is not activity: it must not stretch the axis over
  // the hours it stayed open. Its start counts; its bar is drawn up to the edge of the axis.
  const spans = all
    .map((i) => [i.startedAt, i.status === 'blocked' && i.endedAt == null ? i.startedAt : endOf(i, now)] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const stretches: Array<{ from: number; to: number }> = []
  for (const [from, to] of spans) {
    const last = stretches[stretches.length - 1]
    if (last && from - last.to <= gapMs) last.to = Math.max(last.to, to)
    else stretches.push({ from, to })
  }
  const segments: Segment[] = []
  const breaks: Array<{ atMs: number; ms: number }> = []
  let width = 0
  stretches.forEach((s, i) => {
    if (i > 0) {
      breaks.push({ atMs: width + GAP_WIDTH_MS / 2, ms: s.from - (stretches[i - 1] as { to: number }).to })
      width += GAP_WIDTH_MS
    }
    segments.push({ from: s.from, to: s.to, at: width })
    width += s.to - s.from
  })
  const total = Math.max(width, MIN_SPAN_MS)
  const first = (stretches[0] as { from: number }).from
  const last = (stretches[stretches.length - 1] as { to: number }).to

  /** Real time → percent of the axis. */
  const pos = (t: number): number => {
    const seg = segments.find((s) => t <= s.to) ?? (segments[segments.length - 1] as Segment)
    const within = Math.min(Math.max(t - seg.from, 0), seg.to - seg.from)
    return ((seg.at + within) / total) * 100
  }

  const sections: GanttSection[] = filled.map((lane) => ({
    lane,
    rows: [...lane.items]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((item) => {
        const end = endOf(item, now)
        const left = pos(item.startedAt)
        return {
          item,
          depth: depthOf(item, byId),
          start: item.startedAt,
          end,
          instant: end === item.startedAt,
          leftPct: left,
          widthPct: Math.max(pos(end) - left, 0),
        }
      }),
  }))

  // Ticks: round steps inside each stretch, labelled with the real time since the first event.
  const activeMs = segments.reduce((sum, s) => sum + (s.to - s.from), 0)
  const step = niceStep(activeMs)
  const candidates: GanttTick[] = []
  for (const s of segments) {
    candidates.push({ pct: pos(s.from), offsetMs: s.from - first })
    for (let t = s.from + step; t < s.to; t += step) candidates.push({ pct: pos(t), offsetMs: t - first })
  }
  // A label is about 10 % of the axis wide: keep one only if it clears the previous one.
  const ticks: GanttTick[] = []
  for (const c of candidates) {
    const prev = ticks[ticks.length - 1]
    if (!prev || c.pct - prev.pct >= MIN_TICK_GAP_PCT) ticks.push(c)
  }

  // Concurrency: how many calls are open at once, over the axis.
  const edges: Array<[number, number]> = []
  for (const item of all) {
    const end = endOf(item, now)
    if (CALL_KINDS.has(item.kind) && end > item.startedAt) edges.push([item.startedAt, 1], [end, -1])
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const concurrency: GanttConcurrency[] = []
  let open = 0
  let peak = 0
  for (let i = 0; i < edges.length; i += 1) {
    const [t, d] = edges[i] as [number, number]
    open += d
    peak = Math.max(peak, open)
    const next = edges[i + 1]
    if (open > 0 && next && next[0] > t) {
      const left = pos(t)
      concurrency.push({ leftPct: left, widthPct: pos(next[0]) - left, n: open })
    }
  }

  return {
    sections,
    ticks,
    breaks: breaks.map((b) => ({ pct: (b.atMs / total) * 100, ms: b.ms })),
    concurrency,
    peak,
    count: sections.reduce((n, s) => n + s.rows.length, 0),
    spanMs: last - first,
  }
}
