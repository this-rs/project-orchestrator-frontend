/**
 * The span tree of a trace, as data.
 *
 * Pure: no DOM, no clock (`now` is a parameter). From the lanes of a
 * conversation it builds what a trace viewer shows on its left: a tree of
 * spans (a session → its turns → their tool calls → a sub-agent → its own
 * calls), each with its start, its end, its total time and its SELF time (the
 * part no child covers), and the flat list of rows still visible once some
 * branches are folded.
 *
 * - A lane is a group row; a lane with a `parentLaneId` (a child session) hangs
 *   below its parent lane, so a delegation reads as a subtree.
 * - An item hangs below its `parentId` when that parent is in the same lane;
 *   otherwise (no parent, a parent in another lane, a cycle) at the top of its lane.
 * - A parent with no end of its own (a turn) lasts as long as its children.
 * - An item without a date (a plan, a step: `startedAt` 0) is a row with no bar.
 */
import { endOf, isDated } from './gantt'
import type { TimelineItem, TimelineLane } from './model'

export interface TraceNode {
  /** `lane:<id>` for a lane, the item id for a span. */
  key: string
  type: 'lane' | 'span'
  lane: TimelineLane
  /** The span (for a lane: its own span, when it has one, e.g. a child session). */
  item?: TimelineItem
  depth: number
  parentKey?: string
  children: string[]
  /** Real epoch ms; undefined for a row without a date. */
  start?: number
  end?: number
  /** A moment, not a stretch. */
  instant: boolean
  totalMs: number
  /** Total minus the time covered by its children. Equal to the total for a leaf. */
  selfMs: number
  /** Something below (or the span itself) is still running. */
  running: boolean
}

export interface TraceTree {
  nodes: ReadonlyMap<string, TraceNode>
  roots: string[]
  /** Spans (not lanes), for the counts. */
  spanCount: number
  /** Intervals that shape the time axis (a wait for the reader counts by its start only). */
  intervals: Array<readonly [number, number]>
}

export const laneKey = (laneId: string) => `lane:${laneId}`

/** Total length covered by a set of intervals, overlaps counted once. */
export function unionLength(intervals: ReadonlyArray<readonly [number, number]>): number {
  const sorted = intervals.filter(([a, b]) => b > a).map(([a, b]) => [a, b] as const).sort((x, y) => x[0] - y[0])
  let sum = 0
  let curFrom = -Infinity
  let curTo = -Infinity
  for (const [a, b] of sorted) {
    if (a > curTo) {
      if (curTo > curFrom) sum += curTo - curFrom
      curFrom = a
      curTo = b
    } else curTo = Math.max(curTo, b)
  }
  if (curTo > curFrom) sum += curTo - curFrom
  return sum
}

/** Time of `[start, end]` that none of `children` covers (children clipped to the parent). */
export function selfTime(start: number, end: number, children: ReadonlyArray<readonly [number, number]>): number {
  const clipped = children.map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as const)
  return Math.max(0, end - start - unionLength(clipped))
}

const isRunning = (item: TimelineItem) => item.status === 'running'

export function buildTraceTree(lanes: ReadonlyArray<TimelineLane>, now: number): TraceTree {
  const nodes = new Map<string, TraceNode>()
  const roots: string[] = []
  const intervals: Array<readonly [number, number]> = []
  const laneIds = new Set(lanes.map((l) => l.id))
  let spanCount = 0

  for (const lane of lanes) {
    const key = laneKey(lane.id)
    nodes.set(key, { key, type: 'lane', lane, item: lane.span, depth: 0, children: [], instant: false, totalMs: 0, selfMs: 0, running: false })
  }
  for (const lane of lanes) {
    const node = nodes.get(laneKey(lane.id)) as TraceNode
    const parent = lane.parentLaneId && lane.parentLaneId !== lane.id && laneIds.has(lane.parentLaneId) ? laneKey(lane.parentLaneId) : undefined
    node.parentKey = parent
    if (lane.span && isDated(lane.span)) intervals.push([lane.span.startedAt, endOf(lane.span, now)])
  }
  // A lane cycle (a → b → a) would hide both: break it at the lane met twice.
  for (const lane of lanes) {
    const seen = new Set<string>()
    let cursor: string | undefined = laneKey(lane.id)
    while (cursor) {
      if (seen.has(cursor)) {
        ;(nodes.get(cursor) as TraceNode).parentKey = undefined
        break
      }
      seen.add(cursor)
      cursor = nodes.get(cursor)?.parentKey
    }
  }
  for (const lane of lanes) {
    const node = nodes.get(laneKey(lane.id)) as TraceNode
    if (node.parentKey) (nodes.get(node.parentKey) as TraceNode).children.push(node.key)
    else roots.push(node.key)
  }

  for (const lane of lanes) {
    const ids = new Set(lane.items.map((i) => i.id))
    const byId = new Map(lane.items.map((i) => [i.id, i]))
    for (const item of lane.items) {
      if (nodes.has(item.id)) continue
      spanCount += 1
      const dated = isDated(item)
      const end = dated ? endOf(item, now) : undefined
      nodes.set(item.id, {
        key: item.id, type: 'span', lane, item, depth: 0, children: [],
        start: dated ? item.startedAt : undefined, end, instant: dated && end === item.startedAt,
        totalMs: 0, selfMs: 0, running: isRunning(item),
      })
      if (dated) intervals.push([item.startedAt, item.status === 'blocked' && item.endedAt == null ? item.startedAt : (end as number)])
    }
    for (const item of lane.items) {
      const node = nodes.get(item.id) as TraceNode
      if (node.lane !== lane) continue
      // Climb to make sure the parent chain does not loop back to this item.
      let parent: string | undefined = item.parentId && ids.has(item.parentId) ? item.parentId : undefined
      const seen = new Set<string>([item.id])
      let cursor = parent
      while (cursor) {
        if (seen.has(cursor)) {
          parent = undefined
          break
        }
        seen.add(cursor)
        const up = byId.get(cursor)?.parentId
        cursor = up && ids.has(up) ? up : undefined
      }
      node.parentKey = parent ?? laneKey(lane.id)
      ;(nodes.get(node.parentKey) as TraceNode).children.push(node.key)
    }
  }

  // Children in time order (undated rows first, in their given order), depths, then times bottom-up.
  const order = (key: string) => nodes.get(key)?.start ?? -Infinity
  const walk = (key: string, depth: number): void => {
    const node = nodes.get(key) as TraceNode
    node.depth = depth
    node.children = node.children
      .map((k, i) => [k, i] as const)
      .sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1])
      .map(([k]) => k)
    for (const child of node.children) walk(child, depth + 1)
    const kids = node.children.map((k) => nodes.get(k) as TraceNode).filter((c) => c.start != null && c.end != null)
    const own = node.item && isDated(node.item) ? { start: node.item.startedAt, end: endOf(node.item, now) } : null
    if (node.type === 'lane' && !own) {
      if (kids.length > 0) {
        node.start = Math.min(...kids.map((c) => c.start as number))
        node.end = Math.max(...kids.map((c) => c.end as number))
      }
    } else if (own) {
      node.start = own.start
      // A parent without an end of its own (a turn) lasts as long as what it caused.
      node.end = Math.max(own.end, ...kids.map((c) => c.end as number))
    }
    node.running = node.running || (node.item ? isRunning(node.item) : false) || node.children.some((k) => nodes.get(k)?.running)
    if (node.start != null && node.end != null) {
      node.instant = node.end === node.start
      node.totalMs = node.end - node.start
      node.selfMs = selfTime(node.start, node.end, kids.map((c) => [c.start as number, c.end as number] as const))
    }
  }
  roots.sort((a, b) => order(a) - order(b))
  for (const r of roots) walk(r, 0)
  // Roots sorted by their start once times are known (a lane's start comes from its spans).
  roots.sort((a, b) => {
    const la = nodes.get(a) as TraceNode
    const lb = nodes.get(b) as TraceNode
    // The work lane (no date) first, then lanes by start.
    return (la.start ?? -Infinity) - (lb.start ?? -Infinity)
  })
  return { nodes, roots, spanCount, intervals }
}

/** The rows on screen: the tree depth-first, without what hangs below a folded row. */
export function visibleRows(tree: TraceTree, collapsed: ReadonlySet<string>): TraceNode[] {
  const out: TraceNode[] = []
  const stack = [...tree.roots].reverse()
  while (stack.length > 0) {
    const key = stack.pop() as string
    const node = tree.nodes.get(key)
    if (!node) continue
    out.push(node)
    if (!collapsed.has(key)) for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i] as string)
  }
  return out
}

/** Keys of the rows to unfold so `key` is visible (its ancestors). */
export function ancestorsOf(tree: TraceTree, key: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cursor = tree.nodes.get(key)?.parentKey
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    out.push(cursor)
    cursor = tree.nodes.get(cursor)?.parentKey
  }
  return out
}
