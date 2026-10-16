// ============================================================================
// RATE LIMITS — the wire shapes of an instance's limits and of their state
// ============================================================================
//
// Backend contract (`src/chat/provider/settings.rs`, RL1/RL7), pinned by the
// golden fixtures of `tests/fixtures/rate_limit/` (backend) and
// `src/services/__fixtures__/rate_limit/` (here), which are byte-identical
// copies of each other, like the refs and attention fixtures.
//
// Two families, and they are not the same question: a RATE limit ("how much may
// go out per window") and a BUDGET limit ("how much may this cost per
// day/week/month"). Nothing here is ever a secret: a credential is named by its
// REFERENCE (`vault:<name>`, `env:<VAR>`), never by its value.

import type { MessageKey } from '@/i18n'

/** What `useT().t` is: the translator, without the rest of the context. */
export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string

export type RateLimitKind = 'requests' | 'tokens' | 'budget_usd'
export const RATE_LIMIT_KINDS: readonly RateLimitKind[] = ['requests', 'tokens', 'budget_usd']

export type RateLimitUnit = 'minute' | 'hour' | 'day' | 'week' | 'month'
export const RATE_LIMIT_UNITS: readonly RateLimitUnit[] = ['minute', 'hour', 'day', 'week', 'month']

/** A unit window (`"minute"`) or a rolling one (`{ rolling: 3600 }`, in seconds). */
export type RateLimitWindow = RateLimitUnit | { rolling: number }

/** Whom a limit applies to. */
export type RateLimitScope = 'instance' | { credential: string } | { model: string }

/** One configured limit. */
export interface RateLimit {
  kind: RateLimitKind
  window: RateLimitWindow
  /** Time zone of a day/week/month window: `"utc"` or an IANA name; null otherwise. */
  calendar: string | null
  /** Strictly positive; a whole number for requests and tokens. */
  max: number
  scope: RateLimitScope
}

export type RateLimitStatus = 'ok' | 'limited' | 'overloaded' | 'unknown'

/** One limit and its current state (`GET /chat/providers/{id}/limits`). */
export interface RateLimitState extends RateLimit {
  /** The credential REFERENCE the limit is scoped to, when it is scoped to one. Never a value. */
  credential: string | null
  used: number | null
  remaining: number | null
  resets_at: string | null
  status: RateLimitStatus
  since: string | null
  next_retry_at: string | null
}

export interface RateLimitReport {
  provider_id: string
  status: RateLimitStatus
  limits: RateLimitState[]
}

export const RATE_LIMIT_EVENT = 'provider_rate_limit'

/** The WebSocket event announcing a change of a provider's limit state (RL7, shape only). */
export interface ProviderRateLimitEvent {
  type: typeof RATE_LIMIT_EVENT
  provider_id: string
  credential: string | null
  scope: RateLimitScope
  kind: RateLimitKind
  window: RateLimitWindow
  status: RateLimitStatus
  /** `quota` when a limit (ours or the provider's) is reached, `overload` for an intermittent provider. */
  reason: string | null
  resets_at: string | null
  next_retry_at: string | null
}

// ---------------------------------------------------------------------------
// Reading the wire (tolerant: a field that is missing or of the wrong type
// never invents a limit, it is simply not read)
// ---------------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null

function toKind(v: unknown): RateLimitKind | null {
  return typeof v === 'string' && (RATE_LIMIT_KINDS as readonly string[]).includes(v)
    ? (v as RateLimitKind)
    : null
}

export function toWindow(v: unknown): RateLimitWindow | null {
  if (typeof v === 'string' && (RATE_LIMIT_UNITS as readonly string[]).includes(v)) {
    return v as RateLimitUnit
  }
  const o = obj(v)
  const rolling = o?.rolling
  if (typeof rolling === 'number' && Number.isFinite(rolling) && rolling > 0) return { rolling }
  return null
}

export function toScope(v: unknown): RateLimitScope | null {
  if (v === 'instance') return 'instance'
  const o = obj(v)
  if (o && typeof o.credential === 'string' && o.credential !== '') return { credential: o.credential }
  if (o && typeof o.model === 'string' && o.model !== '') return { model: o.model }
  return null
}

/** One limit of the wire, or null when it is not a limit we can read. */
export function toRateLimit(raw: unknown): RateLimit | null {
  const o = obj(raw)
  if (!o) return null
  const kind = toKind(o.kind)
  const window = toWindow(o.window)
  const scope = toScope(o.scope)
  const max = o.max
  if (!kind || !window || !scope || typeof max !== 'number' || !Number.isFinite(max)) return null
  return { kind, window, calendar: typeof o.calendar === 'string' ? o.calendar : null, max, scope }
}

/** The `rate_limit` list of an instance body: absent or unreadable entries are dropped, never guessed. */
export function toRateLimits(raw: unknown): RateLimit[] {
  return Array.isArray(raw) ? raw.map(toRateLimit).filter((l): l is RateLimit => l !== null) : []
}

function toStatus(v: unknown): RateLimitStatus {
  return v === 'ok' || v === 'limited' || v === 'overloaded' ? v : 'unknown'
}

/** `GET /chat/providers/{id}/limits` → `RateLimitReport | null` (null on an unreadable body). */
export function toRateLimitReport(raw: unknown): RateLimitReport | null {
  const o = obj(raw)
  if (!o || !Array.isArray(o.limits)) return null
  const limits: RateLimitState[] = []
  for (const entry of o.limits) {
    const limit = toRateLimit(entry)
    const e = obj(entry)
    if (!limit || !e) continue
    limits.push({
      ...limit,
      credential: typeof e.credential === 'string' ? e.credential : null,
      used: typeof e.used === 'number' ? e.used : null,
      remaining: typeof e.remaining === 'number' ? e.remaining : null,
      resets_at: typeof e.resets_at === 'string' ? e.resets_at : null,
      status: toStatus(e.status),
      since: typeof e.since === 'string' ? e.since : null,
      next_retry_at: typeof e.next_retry_at === 'string' ? e.next_retry_at : null,
    })
  }
  return {
    provider_id: typeof o.provider_id === 'string' ? o.provider_id : '',
    status: toStatus(o.status),
    limits,
  }
}

// ---------------------------------------------------------------------------
// Plain language: the preview, and the rules the backend enforces
// ---------------------------------------------------------------------------

/** The time zones the runtime knows: `utc` plus the IANA names (`Intl`). */
let cache: Set<string> | null = null
export function knownTimezones(): Set<string> {
  if (cache) return cache
  const set = new Set<string>(['utc', 'UTC'])
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    for (const z of zones) set.add(z)
  } catch {
    // An older runtime: the server stays the authority on time-zone names.
  }
  return (cache = set)
}

/** Whether a time zone is known — the same rule the backend applies. */
export function knownTimezone(raw: string): boolean {
  const v = raw.trim()
  if (v === '') return false
  if (v.toLowerCase() === 'utc') return true
  return knownTimezones().has(v)
}

/** Whether the window is a calendar one (its boundaries are midnights in a time zone). */
export function isCalendarWindow(w: RateLimitWindow): w is RateLimitUnit {
  return typeof w === 'string' && (w === 'day' || w === 'week' || w === 'month')
}

export function kindLabel(kind: RateLimitKind, t: TFunction): string {
  if (kind === 'requests') return t('providerAdmin.limits.kindRequests')
  if (kind === 'tokens') return t('providerAdmin.limits.kindTokens')
  return t('providerAdmin.limits.kindBudget')
}

/** "per minute", "every 60 s"… */
export function windowLabel(w: RateLimitWindow, t: TFunction): string {
  if (typeof w !== 'string') return t('providerAdmin.limits.windowRolling', { secs: String(w.rolling) })
  return t(`providerAdmin.limits.window${w[0].toUpperCase()}${w.slice(1)}` as 'providerAdmin.limits.windowMinute')
}

/** "This instance", "One key vault:deepseek", "One model deepseek-chat". */
export function scopeLabel(scope: RateLimitScope, t: TFunction): string {
  if (scope === 'instance') return t('providerAdmin.limits.scopeInstance')
  if ('credential' in scope) return `${t('providerAdmin.limits.scopeOptionCredential')} ${scope.credential}`
  return `${t('providerAdmin.limits.scopeOptionModel')} ${scope.model}`
}

/** The plain-language preview: "40 Requests per minute (This instance)". */
export function describeLimit(limit: RateLimit, t: TFunction): string {
  const head = t('providerAdmin.limits.preview', {
    max: formatMax(limit.max),
    kind: kindLabel(limit.kind, t),
    window: windowLabel(limit.window, t),
  })
  return `${head}${t('providerAdmin.limits.previewScope', { scope: scopeLabel(limit.scope, t) })}`
}

/** A count is a whole number; money keeps its cents only when it has some. */
export function formatMax(max: number): string {
  return String(max)
}

function same(a: RateLimit, b: RateLimit): boolean {
  return a.kind === b.kind && JSON.stringify(a.window) === JSON.stringify(b.window) && JSON.stringify(a.scope) === JSON.stringify(b.scope)
}

/**
 * The rules, mirrored from `settings::validate_rate_limits`: a strictly positive
 * ceiling, a whole number for requests and tokens, a budget only per day, week or
 * month, a time zone exactly on a calendar window and one that is known, and no
 * two limits sharing the same kind, window and scope. Returns the reason to show,
 * or null. The server refuses anything this lets through.
 */
export function validateLimit(limit: RateLimit, siblings: readonly RateLimit[], t: TFunction): string | null {
  if (!Number.isFinite(limit.max) || limit.max <= 0) return t('providerAdmin.limits.errMax')
  if (limit.kind !== 'budget_usd' && !Number.isInteger(limit.max)) return t('providerAdmin.limits.errWhole')
  const calendar = isCalendarWindow(limit.window)
  // A budget is money per calendar window: day, week or month, never a rate.
  if (limit.kind === 'budget_usd' && !calendar) return t('providerAdmin.limits.errBudgetWindow')
  if (calendar && !limit.calendar) return t('providerAdmin.limits.errCalendarRequired')
  if (calendar && limit.calendar && !knownTimezone(limit.calendar)) return t('providerAdmin.limits.errTimezone')
  if (!calendar && limit.calendar) return t('providerAdmin.limits.errCalendarForbidden')
  if (typeof limit.scope === 'object' && 'credential' in limit.scope) {
    const ref = limit.scope.credential.trim()
    if (ref === 'none' || !/^(vault|env):\S+$/.test(ref)) return t('providerAdmin.limits.errCredential')
  }
  if (typeof limit.scope === 'object' && 'model' in limit.scope && limit.scope.model.trim() === '') {
    return t('providerAdmin.limits.errModel')
  }
  if (siblings.some((other) => other !== limit && same(other, limit))) return t('providerAdmin.limits.errDuplicate')
  return null
}

/** The first reason among a whole list, or null when the list is acceptable. */
export function validateLimits(limits: readonly RateLimit[], t: TFunction): string | null {
  for (const limit of limits) {
    const why = validateLimit(limit, limits, t)
    if (why) return why
  }
  return null
}

/** The windows a kind may use: a budget only has calendar windows. */
export function windowsFor(kind: RateLimitKind): readonly RateLimitWindow[] {
  if (kind !== 'budget_usd') return RATE_LIMIT_UNITS
  return ['day', 'week', 'month']
}

/**
 * "HH:MM" in the reader's own time zone, or null when there is no instant.
 *
 * The SHAPE is fixed — always a 24-hour clock, two digits each, `:` between —
 * because it is dropped into a sentence the screen promises verbatim ("Limit
 * reached until HH:MM"). `toLocaleTimeString` is the wrong tool for that: it
 * follows the RUNTIME locale, so the same instant renders "12:34" on a French
 * machine and "12:34 PM" on an English one (and, in a locale with another
 * numeral system, not even Arabic digits). The reader's ZONE is what must be
 * honoured, not the machine's locale, so the clock is built from the local
 * fields directly.
 */
export function formatClock(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
