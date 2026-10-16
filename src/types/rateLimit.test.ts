/**
 * The rate-limit contract, read from the SAME golden fixtures the backend tests
 * against (`backend/tests/fixtures/rate_limit/` and `src/services/__fixtures__/
 * rate_limit/` are byte-identical copies): a key renamed on one side makes the
 * other side red.
 *
 * Run with: npx vitest run src/types/rateLimit.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { createTranslator } from '@/i18n/translate'
import { bundleOf, loadLocale } from '@/i18n/store'
import {
  describeLimit,
  formatClock,
  isCalendarWindow,
  knownTimezone,
  toRateLimit,
  toRateLimitReport,
  toRateLimits,
  validateLimit,
  validateLimits,
  windowsFor,
  type RateLimit,
  type ProviderRateLimitEvent,
} from './rateLimit'

const t = createTranslator('en', bundleOf('en')!).t
const DIR = join(__dirname, '..', 'services', '__fixtures__', 'rate_limit')
const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as Record<string, unknown>

const FIXTURE_LIMITS = read('limits').limits as RateLimit[]

describe('rate-limit fixtures (shared with the backend)', () => {
  it('every fixture declares the contract version first', () => {
    for (const name of ['limits', 'report', 'event']) {
      const text = readFileSync(join(DIR, `${name}.json`), 'utf8')
      expect(text.split('\n')[1].trim(), name).toMatch(/^"_contract_version": 1/)
    }
  })

  it('limits.json parses into the TS type and round-trips exactly', () => {
    const limits = toRateLimits(read('limits').limits)
    expect(limits).toEqual(FIXTURE_LIMITS)
    expect(limits).toHaveLength(5)
    // The five shapes the fixture exists for.
    expect(limits.some((l) => l.scope === 'instance' && l.window === 'minute')).toBe(true)
    expect(limits.some((l) => l.kind === 'budget_usd' && l.calendar === 'Europe/Paris')).toBe(true)
    expect(limits.some((l) => typeof l.window === 'object' && l.window.rolling === 60)).toBe(true)
    expect(limits.some((l) => typeof l.scope === 'object' && 'credential' in l.scope)).toBe(true)
    expect(limits.some((l) => typeof l.scope === 'object' && 'model' in l.scope)).toBe(true)
  })

  it('report.json parses into the live state, usage null and status unknown', () => {
    const report = toRateLimitReport(read('report').report)
    expect(report).not.toBeNull()
    expect(report!.provider_id).toBe('deepseek')
    expect(report!.status).toBe('unknown')
    expect(report!.limits).toHaveLength(5)
    for (const entry of report!.limits) {
      expect(entry.used).toBeNull()
      expect(entry.remaining).toBeNull()
      expect(entry.resets_at).toBeNull()
      expect(entry.status).toBe('unknown')
    }
    // The credential is named by its REFERENCE, never by a value.
    expect(report!.limits.some((l) => l.credential === 'vault:nvidia-nim')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('sk-')
  })

  it('event.json carries the shape the live pill will read', () => {
    const event = read('event').event as unknown as ProviderRateLimitEvent
    expect(event.type).toBe('provider_rate_limit')
    expect(event.status).toBe('limited')
    expect(event.reason).toBe('quota')
    expect(event.credential).toBe('vault:deepseek')
    expect(JSON.stringify(event)).not.toContain('sk-')
  })

  it('an unreadable entry is dropped, never guessed into a limit', () => {
    expect(toRateLimits([{ kind: 'requests' }, null, 42, { kind: 'nope', window: 'minute', max: 1, scope: 'instance' }])).toEqual([])
    expect(toRateLimit({ kind: 'requests', window: 'minute', max: 10, scope: 'instance' })).toEqual({
      kind: 'requests',
      window: 'minute',
      calendar: null,
      max: 10,
      scope: 'instance',
    })
    expect(toRateLimitReport({ provider_id: 'x' })).toBeNull()
  })
})

describe('the rules, mirrored from the backend', () => {
  const limit = (over: Partial<RateLimit> = {}): RateLimit => ({
    kind: 'requests',
    window: 'minute',
    calendar: null,
    max: 40,
    scope: 'instance',
    ...over,
  })

  it('accepts the golden limits', () => {
    expect(validateLimits(FIXTURE_LIMITS, t)).toBeNull()
  })

  it('refuses what the backend refuses', () => {
    const cases: RateLimit[] = [
      limit({ max: 0 }),
      limit({ max: -1 }),
      limit({ max: 1.5 }),
      limit({ kind: 'tokens', max: 0.5 }),
      limit({ kind: 'budget_usd', window: 'minute', max: 10 }),
      limit({ kind: 'budget_usd', window: { rolling: 3600 }, max: 10 }),
      limit({ window: 'day', calendar: null }),
      limit({ calendar: 'Europe/Paris' }),
      limit({ window: 'day', calendar: 'Mars/Olympus' }),
      limit({ scope: { credential: '' } }),
      limit({ scope: { credential: 'none' } }),
      limit({ scope: { credential: 'sk-live-abcdef' } }),
      limit({ scope: { model: '  ' } }),
    ]
    for (const bad of cases) {
      expect(validateLimit(bad, [bad], t), JSON.stringify(bad)).not.toBeNull()
    }
    // The neighbours of those rules are fine.
    expect(validateLimits([limit({ window: 'day', calendar: 'UTC', max: 1000 })], t)).toBeNull()
    expect(validateLimits([limit({ window: { rolling: 60 } })], t)).toBeNull()
    expect(validateLimits([limit({ scope: { credential: 'vault:deepseek' } })], t)).toBeNull()
    expect(validateLimits([limit({ kind: 'budget_usd', window: 'week', calendar: 'utc', max: 5.5 })], t)).toBeNull()
  })

  it('refuses two limits sharing kind, window and scope', () => {
    const a = limit()
    expect(validateLimits([a, { ...a, max: 90 }], t)).not.toBeNull()
    // Another scope, window or kind is accepted.
    expect(validateLimits([a, limit({ scope: { credential: 'vault:x' } })], t)).toBeNull()
    expect(validateLimits([a, limit({ window: 'hour' })], t)).toBeNull()
    expect(validateLimits([a, limit({ kind: 'tokens' })], t)).toBeNull()
  })

  it('a budget only has calendar windows', () => {
    expect(windowsFor('budget_usd')).toEqual(['day', 'week', 'month'])
    expect(windowsFor('requests')).toContain('minute')
    expect(isCalendarWindow('day')).toBe(true)
    expect(isCalendarWindow('minute')).toBe(false)
    expect(isCalendarWindow({ rolling: 60 })).toBe(false)
  })

  it('accepts utc in any case and the IANA names it knows', () => {
    for (const good of ['utc', 'UTC', 'Utc', 'Europe/Paris', 'America/New_York']) {
      expect(knownTimezone(good), good).toBe(true)
    }
    for (const bad of ['Mars/Olympus', 'europe/paris', 'GMT+2']) {
      expect(knownTimezone(bad), bad).toBe(false)
    }
  })
})

describe('the plain-language preview', () => {
  it('reads as a sentence, and never as a key', () => {
    expect(describeLimit({ kind: 'requests', window: 'minute', calendar: null, max: 40, scope: 'instance' }, t)).toBe(
      '40 requests per minute (This instance)',
    )
    expect(
      describeLimit({ kind: 'budget_usd', window: 'day', calendar: 'Europe/Paris', max: 10, scope: 'instance' }, t),
    ).toBe('10 US dollars per day (This instance)')
    expect(
      describeLimit(
        { kind: 'requests', window: { rolling: 60 }, calendar: null, max: 20, scope: { credential: 'vault:nvidia-nim' } },
        t,
      ),
    ).toBe('20 requests every 60 s (One key vault:nvidia-nim)')
    expect(
      describeLimit({ kind: 'tokens', window: 'hour', calendar: null, max: 200000, scope: { model: 'deepseek-chat' } }, t),
    ).toBe('200000 tokens per hour (One model deepseek-chat)')
  })

  it('the French preview says what the user asked for', async () => {
    const fr = createTranslator('fr', await loadLocale('fr')).t
    expect(describeLimit({ kind: 'requests', window: 'minute', calendar: null, max: 40, scope: 'instance' }, fr)).toBe(
      '40 requêtes par minute (Cette instance)',
    )
  })
})

describe('the clock of a live state', () => {
  // The screen promises "Limit reached until HH:MM" — a shape, not a locale
  // rendering. formatClock used to call toLocaleTimeString(undefined, …), whose
  // output follows the RUNTIME locale: "14:34" on a French machine, "02:34 PM"
  // on an English one. Green locally, red in CI — the exact trap this pins.
  it('always writes a fixed HH:MM, never a locale rendering', () => {
    const iso = '2026-10-08T12:34:00Z'
    const shown = formatClock(iso)
    expect(shown).toMatch(/^\d{2}:\d{2}$/)
    expect(shown).not.toMatch(/[A-Za-z\s]/)
  })

  it('still reads the instant in the reader’s own zone', () => {
    const iso = '2026-10-08T12:34:00Z'
    const d = new Date(iso)
    const expected = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(formatClock(iso)).toBe(expected)
  })

  it('renders nothing when there is no instant', () => {
    expect(formatClock(null)).toBeNull()
    expect(formatClock('not-a-date')).toBeNull()
  })
})
