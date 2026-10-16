/**
 * The conversation as TRACKS, as data — the way a sound editor shows a piece:
 * time runs across, and each row is one thing that was playing. The eye
 * follows a row without climbing a tree.
 *
 * Pure: no DOM, no clock (`now` is a parameter). From the lanes of a
 * conversation (`buildTimeline` / `buildConversationTimeline`) it answers:
 *   - which rows there are, in order, and what sits on each (`Track`);
 *   - where each bar starts and ends in real time (`TrackItem`);
 *   - the intervals that shape the time axis (`buildAxis`).
 *
 * The rule is "one row per PARALLEL action, not one row per event":
 * - a lane (a session) is a group of rows;
 * - inside a group, a FAMILY per nature of action: the turns, the tool calls,
 *   the sub-agents, the waits for the reader, the events (routing, markers,
 *   errors). A tool call made BY a sub-agent goes into that sub-agent's own
 *   family, so a delegation reads as its own instrument;
 * - inside a family, items are packed into rows: an item takes the first row
 *   whose last item ended before it starts, else a new row. Two things at once
 *   are two rows; two things one after the other share a row. (First fit on
 *   items sorted by start uses the fewest rows an interval graph allows.)
 * - an item without a date (a plan, a step: `startedAt` 0) is not on a time axis.
 */
import { buildAxis, toT, toX } from './axis'
import { endOf, isDated } from './gantt'
import type { TimelineItem, TimelineLane } from './model'

export type TrackFamily = 'turns' | 'tools' | 'agents' | 'waits' | 'signals'

export interface TrackItem {
  item: TimelineItem
  /** Real epoch ms the bar covers (a running call ends at `now`). */
  start: number
  end: number
  /** A moment, not a stretch: drawn as a mark. Never true while the item is open. */
  instant: boolean
  /**
   * Still going (running, or a wait not answered yet): its end is not known yet.
   * It packs as open-ended, so nothing else lands after it on its row while it
   * lasts, whatever the gap between the server clock and the browser's `now`.
   */
  open?: boolean
}

export interface Track {
  /** `<laneId>/<family>[/<agentId>]/<row>`: stable across renders. */
  key: string
  laneId: string
  family: TrackFamily
  /** The sub-agent whose calls this track holds (`family` is then `tools`). */
  agent?: TimelineItem
  /** Row index inside its family, and how many rows the family has. */
  row: number
  rows: number
  /** In time order. */
  items: TrackItem[]
  running: boolean
  /** Holds a wait for the reader not answered yet. */
  blocked: boolean
}

export interface TrackGroup {
  lane: TimelineLane
  tracks: Track[]
}

export interface TrackLayout {
  groups: TrackGroup[]
  /** Every track, all groups, in display order. */
  tracks: Track[]
  itemCount: number
  /** Intervals that shape the time axis (a wait for the reader counts by its start only). */
  intervals: Array<readonly [number, number]>
}

/** The order of the families in a group; a sub-agent's family comes after `agents`, by its start. */
const FAMILY_ORDER: readonly TrackFamily[] = ['turns', 'tools', 'agents', 'waits', 'signals']

/**
 * How much of a session's duration an instant takes when rows are packed: about
 * the width of its mark (16 px) on a track ~800 px wide showing everything.
 */
export const INSTANT_SHARE = 0.02

function familyOf(kind: TimelineItem['kind']): TrackFamily | null {
  switch (kind) {
    case 'request':
      return 'turns'
    case 'tool':
      return 'tools'
    case 'agent':
    case 'run':
      return 'agents'
    case 'permission':
      return 'waits'
    case 'routing':
    case 'marker':
    case 'error':
    case 'outage':
      return 'signals'
    default:
      // plan, task, step: work, not activity on a time axis.
      return null
  }
}

/** The closest sub-agent above `item` in its lane, if any. */
function agentAbove(item: TimelineItem, byId: ReadonlyMap<string, TimelineItem>): TimelineItem | undefined {
  const seen = new Set<string>([item.id])
  let cursor = item.parentId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) return undefined
    if (parent.kind === 'agent') return parent
    cursor = parent.parentId
  }
  return undefined
}

/**
 * Pack items (sorted by start) into rows: the first row free at the item's
 * start, else a new one. An item that starts exactly when the previous one
 * ended shares its row. Returns the row of each item and the row count.
 *
 * - An instant packs as if it lasted until `instantEnd(start)` (at least 1 ms):
 *   two events at the same moment, or an event and a bar starting then, are
 *   drawn one above the other instead of stacked on one row where only the top
 *   mark can be clicked.
 * - An open item (running, or a wait not answered) packs as open-ended: its
 *   row stays taken while it lasts.
 */
export function packRows(items: ReadonlyArray<TrackItem>, instantEnd: (start: number) => number = (s) => s + 1): { rowOf: number[]; rows: number } {
  const ends: number[] = []
  const rowOf: number[] = []
  for (const it of items) {
    const end = it.open ? Number.POSITIVE_INFINITY : it.instant ? Math.max(it.end, it.start + 1, instantEnd(it.start)) : it.end
    let row = ends.findIndex((e) => e <= it.start)
    if (row < 0) {
      row = ends.length
      ends.push(end)
    } else ends[row] = end
    rowOf.push(row)
  }
  return { rowOf, rows: ends.length }
}

interface Family {
  family: TrackFamily
  agent?: TimelineItem
  items: TrackItem[]
}

const familyKey = (f: TrackFamily, agent?: TimelineItem) => (agent ? `${f}/${agent.id}` : f)

export function buildTracks(lanes: ReadonlyArray<TimelineLane>, now: number): TrackLayout {
  const intervals: Array<readonly [number, number]> = []
  const collected: Array<{ lane: TimelineLane; families: Family[] }> = []
  let itemCount = 0

  for (const lane of lanes) {
    const items = [...lane.items]
    // A child session's own span, when the lane does not already hold it as an item.
    if (lane.span && !items.some((i) => i.id === lane.span?.id)) items.push(lane.span)
    const byId = new Map(items.map((i) => [i.id, i]))
    const families = new Map<string, Family>()

    for (const item of items) {
      if (!isDated(item)) continue
      const family = familyOf(item.kind)
      if (!family) continue
      const agent = family === 'tools' ? agentAbove(item, byId) : undefined
      const key = familyKey(family, agent)
      let fam = families.get(key)
      if (!fam) {
        fam = { family, ...(agent && { agent }), items: [] }
        families.set(key, fam)
      }
      const end = endOf(item, now)
      // Running or waiting: never a moment, even when the browser clock is behind the server's.
      const open = item.endedAt == null && (item.status === 'running' || item.status === 'blocked')
      fam.items.push({ item, start: item.startedAt, end, instant: !open && end === item.startedAt, ...(open && { open }) })
      intervals.push([item.startedAt, item.status === 'blocked' && item.endedAt == null ? item.startedAt : end])
      itemCount += 1
    }
    if (families.size === 0) continue

    // Families in their order; a sub-agent's family after `agents`, sub-agents by their start.
    const rank = (f: Family) => (f.agent ? FAMILY_ORDER.indexOf('agents') + 0.5 : FAMILY_ORDER.indexOf(f.family))
    collected.push({ lane, families: [...families.values()].sort((a, b) => rank(a) - rank(b) || (a.agent?.startedAt ?? 0) - (b.agent?.startedAt ?? 0)) })
  }

  // An instant packs as wide as its mark: a share of the axis the view draws (silences cut), back in real time.
  const axis = buildAxis(intervals)
  const instantEnd = (start: number) => (axis ? toT(axis, toX(axis, start) + axis.total * INSTANT_SHARE) : start + 1)

  const groups: TrackGroup[] = collected.map(({ lane, families }) => {
    const tracks: Track[] = []
    for (const fam of families) {
      fam.items.sort((a, b) => a.start - b.start || a.end - b.end)
      const { rowOf, rows } = packRows(fam.items, instantEnd)
      const rowItems: TrackItem[][] = Array.from({ length: rows }, () => [])
      fam.items.forEach((it, i) => (rowItems[rowOf[i] as number] as TrackItem[]).push(it))
      rowItems.forEach((its, row) => {
        tracks.push({
          key: `${lane.id}/${familyKey(fam.family, fam.agent)}/${row}`,
          laneId: lane.id,
          family: fam.family,
          ...(fam.agent && { agent: fam.agent }),
          row,
          rows,
          items: its,
          running: its.some((it) => it.item.status === 'running'),
          blocked: its.some((it) => it.open === true && it.item.status === 'blocked'),
        })
      })
    }
    return { lane, tracks }
  })

  return { groups, tracks: groups.flatMap((g) => g.tracks), itemCount, intervals }
}

/** The track that holds `id`, and the item's place on it. */
export function findOnTracks(layout: TrackLayout, id: string): { track: Track; index: number } | null {
  for (const track of layout.tracks) {
    const index = track.items.findIndex((it) => it.item.id === id)
    if (index >= 0) return { track, index }
  }
  return null
}
