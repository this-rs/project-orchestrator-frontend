/**
 * The REST probe that tells, before any chat socket, whether the server
 * understands references (B4). Replaceable: only `fetchRefsCapability` changes
 * when the backend announces `refs_v1` over REST.
 *
 * Run with: npx vitest run src/refs/__tests__/review/refsCapability.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return { ...actual, api: { ...actual.api, get: apiGet } }
})

import { ApiError } from '@/services/api'
import {
  cachedRefsCapability,
  clearRefsCapability,
  ensureRefsCapability,
  fetchRefsCapability,
  refsCapabilityScope,
} from '@/refs/refsCapability'

beforeEach(() => {
  apiGet.mockReset()
  clearRefsCapability()
})

describe('fetchRefsCapability', () => {
  it('200 is present', async () => {
    apiGet.mockResolvedValue({ items: [] })
    expect(await fetchRefsCapability()).toEqual(['refs_v1'])
    expect(apiGet).toHaveBeenCalledWith('/refs/search?q=&limit=1', undefined)
  })
  it('404 is absent', async () => {
    apiGet.mockRejectedValue(new ApiError(404, 'Not Found'))
    expect(await fetchRefsCapability()).toEqual([])
  })
  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['a 500', new ApiError(500, 'boom')],
    ['a 401', new ApiError(401, 'Session expired')],
  ])('%s is unknown', async (_name, err) => {
    apiGet.mockRejectedValue(err)
    expect(await fetchRefsCapability()).toBeNull()
  })
})

describe('ensureRefsCapability', () => {
  const scope = refsCapabilityScope('http://a', 'u1')
  it('asks once per scope: a definite answer is cached, concurrent callers share the request', async () => {
    apiGet.mockResolvedValue({ items: [] })
    const [a, b] = await Promise.all([ensureRefsCapability(scope), ensureRefsCapability(scope)])
    expect(a).toEqual(['refs_v1'])
    expect(b).toEqual(['refs_v1'])
    await ensureRefsCapability(scope)
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(cachedRefsCapability(scope)).toEqual(['refs_v1'])
  })
  it('an unknown answer is not cached: the next call asks again', async () => {
    apiGet.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce({ items: [] })
    expect(await ensureRefsCapability(scope)).toBeNull()
    expect(cachedRefsCapability(scope)).toBeNull()
    expect(await ensureRefsCapability(scope)).toEqual(['refs_v1'])
  })
  it('another account or another server is another scope', async () => {
    apiGet.mockResolvedValue({ items: [] })
    await ensureRefsCapability(scope)
    expect(cachedRefsCapability(refsCapabilityScope('http://a', 'u2'))).toBeNull()
    expect(cachedRefsCapability(refsCapabilityScope('http://b', 'u1'))).toBeNull()
  })
})
