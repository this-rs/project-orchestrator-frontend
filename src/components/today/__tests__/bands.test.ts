import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { buildBands } from '../bands'

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
    band3: b.stuck.flatMap((g) =>
      g.items.flatMap((e) =>
        e.kind === 'orphan'
          ? [e.orphan.request_id]
          : e.kind === 'unattached'
            ? e.session.pending.map((r) => r.request_id)
            : [],
      ),
    ),
  })

  it('a dead free session with pending requests is absent from band 1 and present in band 3', () => {
    const live = base.unattached.find((u) => u.state === 'live' && u.pending.length > 0)!
    const dead = { ...live, id: 'dead-session', state: 'dead' as const, pending: [{ ...live.pending[0], request_id: 'req_dead', session_id: 'dead-session' }] }
    const b = buildBands({ ...base, unattached: [dead] })
    const { band1, band3 } = ids(b)
    expect(band1).not.toContain('req_dead')
    expect(band3).toContain('req_dead')
    const row = b.stuck.flatMap((g) => g.items).find((e) => e.kind === 'unattached' && e.session.id === 'dead-session')
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
