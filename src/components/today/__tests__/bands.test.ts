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
