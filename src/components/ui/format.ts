/**
 * Shared, React-free formatting helpers for entity lists and detail pages.
 * Every function that depends on "now" takes it as a parameter (default:
 * `new Date()`) so callers and tests are deterministic.
 *
 * See DESIGN.md — "Dates" and "Grouping".
 */

import { activeTranslator } from '@/i18n/active'
import type { MessageKey, Vars } from '@/i18n/catalog'

type DateInput = string | number | Date

/** The text of a key in the language on screen (this module is not a component). */
const tr = (key: MessageKey, vars?: Vars): string => activeTranslator().t(key, vars)

function toDate(date: DateInput): Date {
  return date instanceof Date ? date : new Date(date)
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime())
}

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const

/** `12 Sep` / `12 Sep 2025`, word order and month name of the language. */
function dayLabel(d: Date, withYear: boolean): string {
  const vars = { day: String(d.getDate()), month: tr(`ui.time.months.${MONTH_KEYS[d.getMonth()]}`), year: String(d.getFullYear()) }
  return tr(withYear ? 'ui.time.dayMonthYear' : 'ui.time.dayMonth', vars)
}

/**
 * Compact timestamp for row trailing slots:
 * `now` · `5m` · `3h` · `2d` (< 7 days) · `12 Sep` (this year) · `12 Sep 2025`.
 * Future dates: `in 5m` · `in 3h` · `in 2d`, then absolute.
 * Returns `''` for invalid input.
 */
export function formatRelativeShort(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const diffMs = now.getTime() - d.getTime()
  const future = diffMs < 0
  const mins = Math.floor(Math.abs(diffMs) / 60000)
  if (mins < 1) return tr('ui.time.now')
  if (mins < 60) return tr(future ? 'ui.time.inMinutes' : 'ui.time.minutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return tr(future ? 'ui.time.inHours' : 'ui.time.hours', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return tr(future ? 'ui.time.inDays' : 'ui.time.days', { n: days })
  return dayLabel(d, d.getFullYear() !== now.getFullYear())
}

/** Full date for `title` / tooltips: `12 Sep 2026, 14:05`. `''` for invalid input. */
export function formatAbsolute(date: DateInput): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return tr('ui.time.dateTime', { date: dayLabel(d, true), time: `${hh}:${mm}` })
}

/** Day only: `12 Sep` (this year) / `12 Sep 2025`. `''` for invalid input. */
export function formatDay(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  return dayLabel(d, d.getFullYear() !== now.getFullYear())
}

/** `12m`, `1h 5m`, `2d 3h` from a number of minutes (at least 1). */
function spanLabel(mins: number): string {
  if (mins < 60) return tr('ui.time.minutes', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return tr('ui.time.hoursMinutes', { h: hours, m: mins % 60 })
  return tr('ui.time.daysHours', { d: Math.floor(hours / 24), h: hours % 24 })
}

/** Duration in milliseconds: `<1s`, `42s`, `12m`, `1h 5m`, `2d 3h`. */
export function formatDurationMs(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < 1000) return tr('ui.time.lessThanSecond')
  if (safe < 60000) return tr('ui.time.seconds', { n: Math.floor(safe / 1000) })
  return spanLabel(Math.floor(safe / 60000))
}

/** Elapsed time between two instants (default end: now): `<1m`, `42m`, `1h 5m`, `2d 3h`. */
export function formatElapsed(start: DateInput, end: DateInput = new Date()): string {
  const ms = toDate(end).getTime() - toDate(start).getTime()
  const mins = Math.floor(Math.max(0, ms) / 60000)
  if (Number.isNaN(mins)) return ''
  if (mins < 1) return tr('ui.time.lessThanMinute')
  return spanLabel(mins)
}

/** `1 task` / `3 tasks` (custom plural supported). */
export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** `$0.42`, or null when there is no (or zero) cost. */
export function formatCost(cost?: number | null): string | null {
  if (!cost) return null
  return `$${cost.toFixed(2)}`
}

/** Compact number: 950 → `950`, 1 240 → `1.2k`, 3 400 000 → `3.4M`. */
export function formatCompactNumber(n: number): string {
  const abs = Math.abs(n)
  if (abs < 1000) return String(n)
  if (abs < 1_000_000) return `${+(n / 1000).toFixed(1)}k`
  return `${+(n / 1_000_000).toFixed(1)}M`
}

// ============================================================================
// Recency grouping
// ============================================================================

export type RecencyGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'

export const RECENCY_GROUP_ORDER: readonly RecencyGroup[] = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
]

const RECENCY_LABEL_KEYS = {
  Today: 'ui.recency.today',
  Yesterday: 'ui.recency.yesterday',
  'Previous 7 days': 'ui.recency.previous7',
  'Previous 30 days': 'ui.recency.previous30',
  Older: 'ui.recency.older',
} as const satisfies Record<RecencyGroup, MessageKey>

/** The heading of a recency group, in the language on screen (the group id stays the English key). */
export function recencyLabel(group: RecencyGroup): string {
  return tr(RECENCY_LABEL_KEYS[group])
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBefore(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - days)
  return r
}

/** Calendar bucket (local time). Future dates count as "Today"; invalid dates as "Older". */
export function getRecencyGroup(date: DateInput, now: Date = new Date()): RecencyGroup {
  const d = toDate(date)
  if (!isValid(d)) return 'Older'
  const today = startOfDay(now)
  if (d >= today) return 'Today'
  if (d >= daysBefore(today, 1)) return 'Yesterday'
  if (d >= daysBefore(today, 7)) return 'Previous 7 days'
  if (d >= daysBefore(today, 30)) return 'Previous 30 days'
  return 'Older'
}

/**
 * Group items by recency of `getDate(item)`, preserving input order inside a
 * group. Empty groups are omitted; group order is RECENCY_GROUP_ORDER.
 */
export function groupByRecency<T>(
  items: readonly T[],
  getDate: (item: T) => DateInput | null | undefined,
  now: Date = new Date(),
): { group: RecencyGroup; label: string; items: T[] }[] {
  const buckets = new Map<RecencyGroup, T[]>()
  for (const item of items) {
    const raw = getDate(item)
    const g = raw == null ? 'Older' : getRecencyGroup(raw, now)
    const bucket = buckets.get(g)
    if (bucket) bucket.push(item)
    else buckets.set(g, [item])
  }
  return RECENCY_GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({ group: g, label: recencyLabel(g), items: buckets.get(g)! }))
}

/**
 * Group items by an arbitrary key with an explicit order (e.g. status order).
 * Keys missing from `order` are appended in first-seen order.
 */
export function groupBy<T, K extends string>(
  items: readonly T[],
  getKey: (item: T) => K,
  order: readonly K[] = [],
): { key: K; items: T[] }[] {
  const buckets = new Map<K, T[]>()
  for (const item of items) {
    const k = getKey(item)
    const bucket = buckets.get(k)
    if (bucket) bucket.push(item)
    else buckets.set(k, [item])
  }
  const known = order.filter((k) => buckets.has(k))
  const extra = [...buckets.keys()].filter((k) => !order.includes(k))
  return [...known, ...extra].map((k) => ({ key: k, items: buckets.get(k)! }))
}
