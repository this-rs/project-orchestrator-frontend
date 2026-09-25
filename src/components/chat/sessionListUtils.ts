/**
 * Pure helpers for <SessionList /> — recency grouping and compact metadata
 * formatting. Kept free of React so they can be unit-tested in isolation.
 * Every function that depends on "now" takes it as a parameter (default:
 * `new Date()`) so tests are deterministic.
 */
import type { ChatSession, PermissionMode, SpawnedBy } from '@/types'

// ============================================================================
// Recency grouping
// ============================================================================

export type DateGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'

export const DATE_GROUP_ORDER: readonly DateGroup[] = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
]

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBefore(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - days)
  return r
}

/** Calendar-based bucket for a date (local time). Future dates count as "Today". */
export function getDateGroup(date: string | Date, now: Date = new Date()): DateGroup {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = startOfDay(now)
  if (d >= today) return 'Today'
  if (d >= daysBefore(today, 1)) return 'Yesterday'
  if (d >= daysBefore(today, 7)) return 'Previous 7 days'
  if (d >= daysBefore(today, 30)) return 'Previous 30 days'
  return 'Older'
}

/** Group sessions by `updated_at` recency, preserving input order within a group. */
export function groupSessionsByDate<T extends Pick<ChatSession, 'updated_at'>>(
  sessions: T[],
  now: Date = new Date(),
): { group: DateGroup; sessions: T[] }[] {
  const groups = new Map<DateGroup, T[]>()
  for (const s of sessions) {
    const g = getDateGroup(s.updated_at, now)
    const bucket = groups.get(g)
    if (bucket) bucket.push(s)
    else groups.set(g, [s])
  }
  return DATE_GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, sessions: groups.get(g)! }))
}

// ============================================================================
// Time formatting
// ============================================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Compact, right-aligned-friendly timestamp:
 * `now` · `5m` · `3h` · `2d` (< 7 days) · `12 Sep` (this year) · `12 Sep 2025`.
 */
export function formatRelativeShort(date: string | Date | number, now: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date)
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** Full, human readable date used for `title`/`aria` (secondary to the visible short form). */
export function formatAbsolute(date: string | Date | number): string {
  const d = date instanceof Date ? date : new Date(date)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

/** Elapsed time since `startedAt`: `<1m`, `42m`, `1h 5m`. */
export function formatDuration(startedAt: string, now: Date = new Date()): string {
  const diffMins = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000)
  if (diffMins < 1) return '<1m'
  if (diffMins < 60) return `${diffMins}m`
  return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
}

// ============================================================================
// Metadata formatting
// ============================================================================

/** `$0.42`, or null when there is no (or zero) cost. */
export function formatCost(cost?: number | null): string | null {
  if (!cost) return null
  return `$${cost.toFixed(2)}`
}

/** `1 msg` / `12 msgs` */
export function formatMessageCount(count: number): string {
  return `${count} msg${count === 1 ? '' : 's'}`
}

/** Shorten an absolute path by replacing the home directory with ~ */
export function shortenPath(path: string): string {
  if (path.startsWith('~/')) return path
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}

/** Model ids are long (`claude-opus-4-5-20251101`) — drop the vendor prefix and date suffix. */
export function shortModelName(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

export function sessionDisplayTitle(session: Pick<ChatSession, 'id' | 'title'>): string {
  return session.title || `Session ${session.id.slice(0, 8)}`
}

/** Preview line is only worth showing when it adds something beyond the title. */
export function sessionPreview(session: Pick<ChatSession, 'title' | 'preview'>): string | null {
  const p = session.preview?.trim()
  if (!p || p === session.title?.trim()) return null
  return p
}

export const PERMISSION_MODE_META: Record<PermissionMode, { label: string; dot: string }> = {
  bypassPermissions: { label: 'Bypass permissions', dot: 'bg-emerald-400' },
  acceptEdits: { label: 'Accept edits', dot: 'bg-blue-400' },
  default: { label: 'Ask permissions', dot: 'bg-amber-400' },
  plan: { label: 'Plan mode', dot: 'bg-gray-400' },
}

export function permissionModeMeta(mode?: PermissionMode | null): { label: string; dot: string } | null {
  if (!mode) return null
  return PERMISSION_MODE_META[mode] ?? { label: mode, dot: 'bg-gray-400' }
}

const SPAWN_LABELS: Record<string, { label: string; text: string }> = {
  runner: { label: 'runner', text: 'text-blue-400' },
  conversation: { label: 'spawned', text: 'text-violet-400' },
  delegation: { label: 'delegated', text: 'text-amber-400' },
  pipeline: { label: 'pipeline', text: 'text-blue-400' },
  gate: { label: 'gate', text: 'text-amber-400' },
  trigger: { label: 'trigger', text: 'text-teal-400' },
}

/** Short label + text colour describing where a detached session came from. */
export function spawnLabel(spawnedBy: SpawnedBy | { type: string }): { label: string; text: string } {
  return SPAWN_LABELS[spawnedBy.type] ?? SPAWN_LABELS.conversation
}

/** Scope shown on the metadata line: the workspace wins over the project (same rule as before). */
export function sessionScope(
  s: Pick<ChatSession, 'workspace_slug' | 'project_slug'>,
): { kind: 'workspace' | 'project'; slug: string } | null {
  if (s.workspace_slug) return { kind: 'workspace', slug: s.workspace_slug }
  if (s.project_slug) return { kind: 'project', slug: s.project_slug }
  return null
}

/** Number of filters that differ from their default (spawned sessions default = shown). */
export function countActiveFilters(f: { project: string; planOrRfc: string; showSpawned: boolean }): number {
  return (f.project ? 1 : 0) + (f.planOrRfc ? 1 : 0) + (f.showSpawned ? 0 : 1)
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}
