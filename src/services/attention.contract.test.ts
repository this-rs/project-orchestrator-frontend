import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from './attention'
import {
  BANDS,
  LINK_VIAS,
  SESSION_STATES,
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
const DATASETS = [
  'empty', 'one_band', 'four_bands', 'runner_busy', 'orphan', 'blocked_task', 'forty_threads',
  // session-link amendment (note 07909b4a)
  'multi_link', 'unattached_waiting', 'resumed_run',
]
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
    expect(get('multi_link').threads[0].sessions.some((s) => s.links.length >= 2)).toBe(true)
    const un = get('unattached_waiting').unattached
    expect(un.some((s) => s.state === 'live' && s.pending.length > 0)).toBe(true)
    expect(un.some((s) => s.state === 'dead')).toBe(true)
    const t = get('resumed_run').threads[0]
    const runIds = new Set(t.sessions.flatMap((s) => s.links.map((l) => l.run_id).filter(Boolean)))
    expect(runIds.has(t.run!.id) && runIds.size === 2).toBe(true)
    expect(new Set(t.sessions.flatMap((s) => s.links.map((l) => l.plan_id).filter(Boolean))).size).toBe(1)
  })

  it('session links are consistent: never empty, de-duplicated, id per mechanism, unattached apart', () => {
    for (const name of DATASETS) {
      const r = parseAttentionResponse(read(name))
      const attached = new Set<string>()
      for (const t of r.threads) {
        expect(t.sessions.map((s) => s.id), name).toEqual(t.session_ids)
        for (const s of t.sessions) {
          expect(attached.has(s.id), `${name}: session in two threads`).toBe(false)
          attached.add(s.id)
          expect(s.links.length, `${name}: attached session without link`).toBeGreaterThan(0)
          expect(new Set(s.links.map((l) => JSON.stringify(l))).size, `${name}: duplicated link`).toBe(s.links.length)
          for (const l of s.links) {
            const ok =
              l.via === 'runner_run' ? l.run_id !== null
              : l.via === 'spawned_by_json' ? l.run_id !== null || l.plan_id !== null
              : l.via === 'task_association' ? l.task_id !== null
              : l.plan_id !== null
            expect(ok, `${name}: link ${l.via} lacks its id`).toBe(true)
          }
        }
      }
      const slugs = r.lanes.map((l) => l.slug)
      for (const u of r.unattached) {
        expect(attached.has(u.id), `${name}: unattached AND attached`).toBe(false)
        expect(slugs).toContain(u.workspace_slug)
        for (const p of u.pending) {
          expect(p.session_id).toBe(u.id)
          expect(p.thread_id).toBeNull()
          expect(p.workspace).toBe(u.workspace_slug)
        }
      }
      for (const w of [...r.waiting, ...r.orphans]) {
        if (w.thread_id) expect(r.threads.find((t) => t.id === w.thread_id)!.session_ids).toContain(w.session_id)
      }
    }
  })

  it('unattached sessions are grouped by lane (lane order, then oldest first)', () => {
    for (const name of DATASETS) {
      const r = parseAttentionResponse(read(name))
      const ix = (slug: string) => r.lanes.findIndex((l) => l.slug === slug)
      const keys = r.unattached.map((u) => [ix(u.workspace_slug), -u.age_secs, u.id] as const)
      const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
      expect(keys, name).toEqual(sorted)
    }
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
      link_via: [...LINK_VIAS],
      session_state: [...SESSION_STATES],
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
    it('rejects a PascalCase link mechanism and a link without provenance fields', () => {
      const r = base()
      const s = r.threads.find((t: any) => t.sessions.length > 0).sessions[0] // eslint-disable-line @typescript-eslint/no-explicit-any
      s.links[0].via = 'RunnerRun'
      expect(() => parseAttentionResponse(r)).toThrow(/unknown value "RunnerRun"/)
      const r2 = base()
      const s2 = r2.threads.find((t: any) => t.sessions.length > 0).sessions[0] // eslint-disable-line @typescript-eslint/no-explicit-any
      delete s2.links[0].task_id
      expect(() => parseAttentionResponse(r2)).toThrow(/missing field "task_id"/)
    })
    it('rejects a response without unattached[] and an unknown field inside it', () => {
      const r = JSON.parse(JSON.stringify(read('unattached_waiting')))
      r.unattached[0].extra = 1
      expect(() => parseAttentionResponse(r)).toThrow(/unknown field "extra"/)
      delete r.unattached
      expect(() => parseAttentionResponse(r)).toThrow(/missing field "unattached"/)
    })
    it('rejects camelCase keys', () => {
      const r = base()
      r.generatedAt = r.generated_at
      delete r.generated_at
      expect(() => parseAttentionResponse(r)).toThrow()
    })
  })
})
