import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { BAND_ORDER, BAND_TEXT, SECTION_ORDER, buildBands, shownPlanIds } from '../bands'

const fixture = (name: string): AttentionResponse =>
  parseAttentionResponse(
    JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention', `${name}.json`), 'utf8')),
  )

describe('buildBands — band 1 and live thread-less sessions', () => {
  const data = fixture('unattached_waiting')
  const livePending = data.unattached.filter((u) => u.state === 'live' && u.pending.length > 0)

  it('shows a live free session with a pending request in band 1, without thread', () => {
    expect(livePending.length).toBeGreaterThan(0)
    const b = buildBands(data)
    for (const u of livePending) {
      for (const r of u.pending) {
        const e = b.waiting.find((w) => w.request.request_id === r.request_id)
        expect(e?.thread).toBeNull()
        expect(e?.unattached?.id).toBe(u.id)
      }
    }
    expect(b.counts.waiting).toBe(b.waiting.length)
  })

  it('sorts band 1 by age, oldest first, thread-less entries included', () => {
    const ages = buildBands(data).waiting.map((w) => w.request.age_secs)
    expect(ages).toEqual([...ages].sort((a, b) => b - a))
  })

  it('does not duplicate a request already present in waiting[]', () => {
    const u = livePending[0]
    const dup = { ...data, waiting: [...data.waiting, { ...u.pending[0], thread_id: null }] }
    const ids = buildBands(dup).waiting.map((w) => w.request.request_id)
    expect(ids.filter((id) => id === u.pending[0].request_id)).toHaveLength(1)
  })
})

describe('buildBands — a dead session never waits on the user (band 1), its request is never lost or doubled', () => {
  const base = fixture('unattached_waiting')
  const ids = (b: ReturnType<typeof buildBands>) => ({
    band1: b.waiting.map((w) => w.request.request_id),
    band3: b.stuck.flatMap((e) =>
      e.kind === 'orphan' ? [e.orphan.request_id] : e.kind === 'unattached' ? e.session.pending.map((r) => r.request_id) : [],
    ),
  })

  it('a dead free session with pending requests is absent from band 1 and present in band 3', () => {
    const live = base.unattached.find((u) => u.state === 'live' && u.pending.length > 0)!
    const dead = { ...live, id: 'dead-session', state: 'dead' as const, pending: [{ ...live.pending[0], request_id: 'req_dead', session_id: 'dead-session' }] }
    const b = buildBands({ ...base, unattached: [dead] })
    const { band1, band3 } = ids(b)
    expect(band1).not.toContain('req_dead')
    expect(band3).toContain('req_dead')
    const row = b.stuck.find((e) => e.kind === 'unattached' && e.session.id === 'dead-session')
    expect(row).toBeDefined()
    expect(b.counts.waiting).toBe(0)
  })

  it('a dead-session request still listed in waiting[] goes to band 3 only, never lost', () => {
    const o = fixture('orphan')
    const dead = o.threads[0].sessions[0]
    expect(dead.state).toBe('dead')
    const req = { ...o.orphans[0], request_id: 'req_w' }
    const { cli_stopped_at: _drop, ...asWaiting } = req
    void _drop
    const b = buildBands({ ...o, orphans: [], waiting: [asWaiting] })
    const { band1, band3 } = ids(b)
    expect(band1).toEqual([])
    expect(band3).toEqual(['req_w'])
  })

  it('dedups one request_id across waiting[], orphans[] and unattached[].pending: band 3 once, band 1 never', () => {
    const o = fixture('orphan')
    const orphan = o.orphans[0]
    const { cli_stopped_at: _drop, ...asWaiting } = orphan
    void _drop
    const u = { ...base.unattached[0], state: 'dead' as const, pending: [orphan] }
    const b = buildBands({ ...o, waiting: [asWaiting], unattached: [u] })
    const { band1, band3 } = ids(b)
    expect(band1).toEqual([])
    expect(band3.filter((id) => id === orphan.request_id)).toHaveLength(1)
  })

  it('an orphan[] request also listed as pending of a live free session is shown in band 3 only', () => {
    const live = base.unattached.find((u) => u.state === 'live' && u.pending.length > 0)!
    const r = live.pending[0]
    const b = buildBands({ ...base, unattached: [live], orphans: [{ ...r, thread_id: null, cli_stopped_at: null }] })
    const { band1, band3 } = ids(b)
    expect(band1).not.toContain(r.request_id)
    expect(band3.filter((id) => id === r.request_id)).toHaveLength(1)
  })
})

describe('buildBands — a session whose state is unknown is NOT actionable', () => {
  it('a waiting[] request of a session found nowhere goes to band 3 (resume), never to band 1', () => {
    const base = fixture('four_bands')
    const known = base.waiting[0]
    const ghost = { ...known, request_id: 'req_ghost', session_id: 'ghost-session', thread_id: null }
    const b = buildBands({ ...base, waiting: [ghost] })
    expect(b.waiting.map((w) => w.request.request_id)).not.toContain('req_ghost')
    const inBand3 = b.stuck.some((e) => e.kind === 'unattached' && e.session.pending.some((r) => r.request_id === 'req_ghost'))
    expect(inBand3).toBe(true)
  })
})

describe('buildBands — band 1 ties on age are ordered by request id, like the recommendation', () => {
  it('equal ages: smallest request id first, whatever the payload order', () => {
    const base = fixture('four_bands')
    const live = buildBands(base).waiting[0].request
    const mk = (id: string) => ({ ...live, request_id: id, age_secs: 999999 })
    const a = buildBands({ ...base, waiting: [mk('req_b'), mk('req_a')] }).waiting.map((w) => w.request.request_id)
    const b = buildBands({ ...base, waiting: [mk('req_a'), mk('req_b')] }).waiting.map((w) => w.request.request_id)
    expect(a.slice(0, 2)).toEqual(['req_a', 'req_b'])
    expect(b.slice(0, 2)).toEqual(['req_a', 'req_b'])
  })
})

describe('buildBands: "En cours" is grouped by plan', () => {
  const data = fixture('four_bands')
  const running = data.threads.filter((t) => t.band === 'running')

  it('one row per plan, whatever the workspace', () => {
    const b = buildBands(data)
    const plans = b.running.filter((e) => e.kind === 'plan')
    expect(plans.length).toBeGreaterThan(0)
    expect(new Set(plans.map((e) => (e.kind === 'plan' ? e.key : ''))).size).toBe(plans.length)
    expect(b.counts.running).toBe(b.running.length)
  })

  it('two threads of the same plan make ONE row, the running one speaks for it', () => {
    const base = running[0]
    const stopped = { ...base, id: 'stopped-thread', run: { ...base.run!, status: 'failed' as const } }
    const live = { ...base, id: 'live-thread', run: { ...base.run!, status: 'running' as const } }
    const b = buildBands({ ...data, threads: [stopped, live], waiting: [], orphans: [], thinking: [], unattached: [] })
    expect(b.running).toHaveLength(1)
    const row = b.running[0]
    expect(row.kind === 'plan' && row.thread.id).toBe('live-thread')
    expect(row.kind === 'plan' && row.others.map((t) => t.id)).toEqual(['stopped-thread'])
  })

  it('threads of different plans stay apart, even in one workspace', () => {
    const a = { ...running[0], id: 'ta', plan: { id: 'plan-a', title: 'A' } }
    const c = { ...running[0], id: 'tc', plan: { id: 'plan-c', title: 'C' } }
    const b = buildBands({ ...data, threads: [a, c], waiting: [], orphans: [], thinking: [], unattached: [] })
    expect(b.running).toHaveLength(2)
  })

  it('a thread without a plan is its own row', () => {
    const a = { ...running[0], id: 'ta', plan: null }
    const c = { ...running[0], id: 'tc', plan: null }
    const b = buildBands({ ...data, threads: [a, c], waiting: [], orphans: [], thinking: [], unattached: [] })
    expect(b.running).toHaveLength(2)
  })
})

describe('buildBands: "À reprendre" is one list, oldest first, tie by id', () => {
  it('is not cut by workspace', () => {
    const data = fixture('unattached_waiting')
    const b = buildBands(data)
    const age = (e: (typeof b.stuck)[number]) =>
      e.kind === 'stuck' ? e.thread.age_secs : e.kind === 'orphan' ? e.orphan.age_secs : e.session.age_secs
    const ages = b.stuck.map(age)
    expect(ages).toEqual([...ages].sort((x, y) => y - x))
  })
})

describe('section texts and order', () => {
  it('uses plain words, none of the former band names', () => {
    expect(Object.values(BAND_TEXT).map((t) => t.title)).toEqual(['À traiter', 'En cours', 'À reprendre', 'À suivre'])
    const all = JSON.stringify(BAND_TEXT)
    expect(all).not.toMatch(/T.attend|Tourne|Coincé|Pensée|cockpit/i)
  })
  it('the summary keeps the band order, the page puts what asks for the user first', () => {
    expect(BAND_ORDER).toEqual(['waiting', 'running', 'stuck', 'thinking'])
    expect(SECTION_ORDER).toEqual(['waiting', 'stuck', 'running', 'thinking'])
  })
})

describe('shownPlanIds: the plans the queue already shows', () => {
  it('collects the plan of every running, waiting and stuck thread, and nothing else', () => {
    const data = fixture('four_bands')
    const b = buildBands(data)
    const ids = shownPlanIds(b)
    const expected = new Set<string>()
    for (const t of data.threads) {
      const inRunning = b.running.some((e) => e.kind === 'plan' && (e.thread === t || e.others.includes(t)))
      const inStuck = b.stuck.some((e) => e.kind !== 'unattached' && e.thread === t)
      const inWaiting = b.waiting.some((e) => e.thread === t)
      if (t.plan && (inRunning || inStuck || inWaiting)) expected.add(t.plan.id)
    }
    expect(expected.size).toBeGreaterThan(0)
    expect([...ids].sort()).toEqual([...expected].sort())
  })

  it('is empty when nothing waits, runs or is to resume', () => {
    expect(shownPlanIds(buildBands(fixture('empty'))).size).toBe(0)
  })
})
