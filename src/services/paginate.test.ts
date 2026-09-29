import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages } from './paginate'

const mk = (total: number) =>
  vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => ({
    items: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => offset + i),
    total,
    limit,
    offset,
  }))

describe('fetchAllPages', () => {
  it('drains every page', async () => {
    const f = mk(250)
    const r = await fetchAllPages(f, { pageSize: 100 })
    expect(r.items).toHaveLength(250)
    expect(r.truncated).toBe(false)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('stops at maxItems and says so', async () => {
    const r = await fetchAllPages(mk(1000), { pageSize: 100, maxItems: 300 })
    expect(r.items).toHaveLength(300)
    expect(r.truncated).toBe(true)
  })
})
