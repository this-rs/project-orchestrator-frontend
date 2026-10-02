/**
 * The day plan: the tasks the user chose to work on today, in the order they
 * want to do them. Kept in localStorage (a personal convenience, per browser),
 * so it never touches the backend and survives a reload. Pure functions over a
 * plain object, so the rules are testable without a DOM.
 *
 * A new day keeps the unfinished ids (carry-over) and lets the page drop the
 * ones completed before today; nothing is silently lost overnight.
 */

export interface DayPlan {
  /** Local calendar day the plan was last opened, `YYYY-MM-DD`. */
  date: string
  /** Task ids, in the order to work on them. */
  ids: string[]
}

export const DAY_PLAN_KEY = 'po.today.dayplan.v1'

/** Local `YYYY-MM-DD` (not UTC: "today" is the user's day). */
export function dayKey(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function emptyDayPlan(now: Date = new Date()): DayPlan {
  return { date: dayKey(now), ids: [] }
}

function isPlan(v: unknown): v is DayPlan {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as DayPlan).date === 'string' &&
    Array.isArray((v as DayPlan).ids) &&
    (v as DayPlan).ids.every((i) => typeof i === 'string')
  )
}

/** Reads the stored plan; anything unreadable is an empty plan, never an error. */
export function loadDayPlan(storage: Pick<Storage, 'getItem'> | null, now: Date = new Date()): DayPlan {
  try {
    const raw = storage?.getItem(DAY_PLAN_KEY)
    if (!raw) return emptyDayPlan(now)
    const parsed: unknown = JSON.parse(raw)
    if (!isPlan(parsed)) return emptyDayPlan(now)
    const ids = [...new Set(parsed.ids)]
    return { date: dayKey(now), ids }
  } catch {
    return emptyDayPlan(now)
  }
}

export function saveDayPlan(storage: Pick<Storage, 'setItem'> | null, plan: DayPlan): void {
  try {
    storage?.setItem(DAY_PLAN_KEY, JSON.stringify(plan))
  } catch {
    /* private mode / quota: the plan just won't survive a reload */
  }
}

export function addToDay(plan: DayPlan, id: string): DayPlan {
  return plan.ids.includes(id) ? plan : { ...plan, ids: [...plan.ids, id] }
}

export function removeFromDay(plan: DayPlan, id: string): DayPlan {
  return plan.ids.includes(id) ? { ...plan, ids: plan.ids.filter((i) => i !== id) } : plan
}

/** Moves a task one place up (-1) or down (+1); out of range is a no-op. */
export function moveInDay(plan: DayPlan, id: string, delta: -1 | 1): DayPlan {
  const from = plan.ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= plan.ids.length) return plan
  const ids = [...plan.ids]
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  return { ...plan, ids }
}

/** True when the task was completed on the same local day as `now`. */
export function isDoneToday(completedAt: string | undefined, now: Date = new Date()): boolean {
  if (!completedAt) return false
  const t = new Date(completedAt)
  return !Number.isNaN(t.getTime()) && dayKey(t) === dayKey(now)
}
