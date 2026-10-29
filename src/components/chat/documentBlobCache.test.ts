import { describe, expect, it, vi } from 'vitest'
import { createDocumentBlobCache } from './documentBlobCache'

const blob = (name: string) => new Blob([name], { type: 'image/png' })

describe('createDocumentBlobCache', () => {
  it('downloads a document once, however many callers ask', async () => {
    const load = vi.fn().mockResolvedValue(blob('x'))
    const cache = createDocumentBlobCache(load)

    const [a, b] = await Promise.all([cache.get('d1'), cache.get('d1')])
    const c = await cache.get('d1')

    expect(load).toHaveBeenCalledTimes(1)
    // The same Blob instance: a second copy in memory would defeat the point.
    expect(a).toBe(b)
    expect(c).toBe(a)
  })

  it('keeps distinct documents apart', async () => {
    const load = vi.fn((id: string) => Promise.resolve(blob(id)))
    const cache = createDocumentBlobCache(load)

    expect(await (await cache.get('d1')).text()).toBe('d1')
    expect(await (await cache.get('d2')).text()).toBe('d2')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('forgets a failure, so the next render retries instead of replaying it', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(blob('ok'))
    const cache = createDocumentBlobCache(load)

    await expect(cache.get('d1')).rejects.toThrow('503')
    expect(cache.size()).toBe(0)
    await expect(cache.get('d1')).resolves.toBeInstanceOf(Blob)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('evicts the oldest entry past the bound, never the newest', async () => {
    const load = vi.fn((id: string) => Promise.resolve(blob(id)))
    const cache = createDocumentBlobCache(load, 2)

    await cache.get('d1')
    await cache.get('d2')
    await cache.get('d3')

    expect(cache.size()).toBe(2)
    // d1 is gone, so asking again is a new download; d3 is still held.
    await cache.get('d1')
    await cache.get('d3')
    expect(load.mock.calls.map(([id]) => id)).toEqual(['d1', 'd2', 'd3', 'd1'])
  })

  it('a cleared cache downloads again', async () => {
    const load = vi.fn((id: string) => Promise.resolve(blob(id)))
    const cache = createDocumentBlobCache(load)
    await cache.get('d1')
    cache.clear()
    await cache.get('d1')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
