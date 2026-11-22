/**
 * What the "stop the session's tools" dialog lets a person pick, as pure
 * functions: grouping, age, the quick selections and the plan a confirmation
 * turns into. No DOM and no request here (see `StopToolsDialog`).
 *
 * A row is stoppable on its own only when the backend can target it
 * (`taskId` → `cancel-task`): background shells and monitors. Sub-agents,
 * workflows and runs have no task id; only the session-wide stop reaches them.
 */
import type { RunningItem } from './runningActivity'

/** "Only the old ones" keeps running whatever started less than this long ago. */
export const RECENT_THRESHOLD_MINUTES = 10
export const RECENT_THRESHOLD_MS = RECENT_THRESHOLD_MINUTES * 60_000
/** Targeted stops sent at once: the backend caps cancel-task per session. */
export const STOP_CONCURRENCY = 4

export type StopGroup = 'agent' | 'background' | 'monitor' | 'other'
export const GROUP_ORDER: ReadonlyArray<StopGroup> = ['agent', 'background', 'monitor', 'other']

export function groupOf(item: RunningItem): StopGroup {
  switch (item.kind) {
    case 'agent':
    case 'workflow':
      return 'agent'
    case 'shell':
      return 'background'
    case 'monitor':
      return 'monitor'
    default:
      return 'other'
  }
}

/** Milliseconds since the item started; `undefined` when its start is unknown. */
export function ageMs(item: RunningItem, now: number): number | undefined {
  if (!item.startedAt) return undefined
  const start = new Date(item.startedAt).getTime()
  return Number.isNaN(start) ? undefined : Math.max(0, now - start)
}

export type Selection = ReadonlySet<string>

export const selectAll = (items: ReadonlyArray<RunningItem>): Selection => new Set(items.map((i) => i.id))
export const selectNone = (): Selection => new Set()

/**
 * Keeps ticked only what is at least `RECENT_THRESHOLD_MS` old. An item whose
 * start is unknown is not proven old, so it is left running (unticked).
 */
export function onlyOld(items: ReadonlyArray<RunningItem>, selection: Selection, now: number): Selection {
  return new Set(items.filter((i) => selection.has(i.id) && (ageMs(i, now) ?? -1) >= RECENT_THRESHOLD_MS).map((i) => i.id))
}

/** Unticks one group, leaves the rest as it is. */
export function keepGroup(items: ReadonlyArray<RunningItem>, selection: Selection, group: StopGroup): Selection {
  return new Set(items.filter((i) => selection.has(i.id) && groupOf(i) !== group).map((i) => i.id))
}

export interface StopPlan {
  /** `all`: every listed row is ticked, the session-wide stop is used. */
  mode: 'all' | 'partial'
  /** Partial only: ticked rows the backend can target, one `cancel-task` each. */
  targets: RunningItem[]
  /** Partial only: ticked rows with no task id. They are NOT stopped. */
  untargetable: RunningItem[]
}

export function planStop(items: ReadonlyArray<RunningItem>, selection: Selection): StopPlan {
  const ticked = items.filter((i) => selection.has(i.id))
  if (ticked.length === items.length) return { mode: 'all', targets: [], untargetable: [] }
  return {
    mode: 'partial',
    targets: ticked.filter((i) => i.taskId && !i.readOnly),
    untargetable: ticked.filter((i) => !i.taskId || i.readOnly),
  }
}

/** Runs `fn` over `list` with at most `limit` in flight. `fn` must not throw. */
export async function runPool<T>(list: ReadonlyArray<T>, limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < list.length) await fn(list[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
}
