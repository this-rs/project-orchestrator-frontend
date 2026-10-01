import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from './attention'
import {
  BANDS,
  ATTENTION_RUN_STATUSES,
  REQUEST_KINDS,
  RUNNER_STATUSES,
  STUCK_REASONS,
  THINKING_KINDS,
  WAVE_POINT_STATUSES,
} from '@/types/attention'

/**
 * Shared-fixture contract test. The JSON files in `__fixtures__/attention/`
 * are byte-identical copies of the backend's `tests/fixtures/attention/`; the
 * Rust side deserializes the same files (`api::attention` tests). A field,
 * enum value or casing that diverges makes one of the two sides fail.
 */
const DIR = join(__dirname, '__fixtures__', 'attention')
const DATASETS = ['empty', 'one_band', 'four_bands', 'runner_busy', 'orphan', 'blocked_task', 'forty_threads']
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'))

describe('attention contract (shared fixtures)', () => {
  it.each(DATASETS)('fixture %s parses into the TS types and round-trips exactly', (name) => {
    const raw = read(name)
    expect(parseAttentionResponse(raw)).toEqual(raw)
  })

  it('every fixture is sorted by waiting age, oldest first', () => {
    for (const name of DATASETS) {
      const r = parseAttentionResponse(read(name))
      for (const list of [r.threads, r.waiting, r.orphans, r.thinking]) {
        const ages = list.map((x) => x.age_secs)
        expect(ages, name).toEqual([...ages].sort((a, b) => b - a))
      }
    }
  })

  it('covers the required scenarios', () => {
    const get = (n: string) => parseAttentionResponse(read(n))
    expect(get('empty').threads).toHaveLength(0)
    expect(new Set(get('one_band').threads.map((t) => t.band)).size).toBe(1)
    expect(new Set(get('four_bands').threads.map((t) => t.band)).size).toBe(4)
    expect(get('runner_busy').runner.status).toBe('busy')
    expect(get('orphan').orphans.length).toBeGreaterThan(0)
    expect(get('blocked_task').threads.some((t) => t.stuck_reason === 'task_blocked' && t.blocked_tasks.length > 0)).toBe(true)
    expect(get('forty_threads').threads).toHaveLength(40)
  })

  it('enum vocabulary matches the shared enums.json (also checked by Rust)', () => {
    expect(read('enums')).toEqual({
      band: [...BANDS],
      wave_point_status: [...WAVE_POINT_STATUSES],
      run_status: [...ATTENTION_RUN_STATUSES],
      stuck_reason: [...STUCK_REASONS],
      request_kind: [...REQUEST_KINDS],
      runner_status: [...RUNNER_STATUSES],
      thinking_kind: [...THINKING_KINDS],
    })
  })

  it('fixtures match MANIFEST.sha256 (identical copy in the backend repo)', () => {
    const names = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()
    const listing = names
      .map((n) => `${createHash('sha256').update(readFileSync(join(DIR, n))).digest('hex')}  ${n}\n`)
      .join('')
    expect(listing).toBe(readFileSync(join(DIR, 'MANIFEST.sha256'), 'utf8'))
  })

  describe('divergence is detected', () => {
    const base = () => JSON.parse(JSON.stringify(read('four_bands'))) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

    it('rejects an unknown field', () => {
      const r = base()
      r.threads[0].surprise = 1
      expect(() => parseAttentionResponse(r)).toThrow(/unknown field "surprise"/)
    })
    it('rejects a missing field', () => {
      const r = base()
      delete r.runner.busy_with
      expect(() => parseAttentionResponse(r)).toThrow(/missing field "busy_with"/)
    })
    it('rejects PascalCase enum values', () => {
      const r = base()
      r.threads[0].band = 'Waiting'
      expect(() => parseAttentionResponse(r)).toThrow(/unknown value "Waiting"/)
    })
    it('rejects camelCase keys', () => {
      const r = base()
      r.generatedAt = r.generated_at
      delete r.generated_at
      expect(() => parseAttentionResponse(r)).toThrow()
    })
  })
})
