import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, NonJsonResponseError } from './api'
import { codeApi } from './code'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('codeApi.analyzeImpact', () => {
  it('turns the 404 of an unknown file into an empty result, not an exception', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      new ApiError(404, 'file not found in graph: src/unknown.rs'),
    )

    const result = await codeApi.analyzeImpact('src/unknown.rs')

    expect(result).toEqual({
      direct_dependents: [],
      transitive_dependents: [],
      affected_tests: [],
      risk_score: 0,
      not_in_graph: true,
    })
  })

  it('keeps an analysed file with no dependents distinct from an unknown one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      direct_dependents: [],
      transitive_dependents: [],
      affected_tests: [],
      risk_score: 0,
    })

    const result = await codeApi.analyzeImpact('/repo/app/src/leaf.rs')

    expect(result.not_in_graph).toBeUndefined()
  })

  it('still rejects the other failures: a server error is not an empty analysis', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(500, 'boom'))

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(ApiError)
  })

  it('keeps an HTML 404 an error: a proxy that misroutes /api is not an empty graph', async () => {
    // `NonJsonResponseError` IS an `ApiError` carrying status 404: a predicate on
    // the status alone would swallow a proxy/static fallback page.
    vi.spyOn(api, 'get').mockRejectedValue(
      new NonJsonResponseError(404, 'GET', '/api/code/impact', 'text/html'),
    )

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(NonJsonResponseError)
  })

  it('keeps a 404 that does not name the graph an error', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(404, '{"error":"project not found"}'))

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(ApiError)
  })

  it('composes with the array path: one unknown target does not reject the batch', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new ApiError(404, 'file not found in graph: src/unknown.rs'))
      .mockResolvedValueOnce({
        direct_dependents: ['a.rs'],
        transitive_dependents: [],
        affected_tests: [],
        risk_score: 3,
      })

    const results = await Promise.all(
      ['src/unknown.rs', 'src/lib.rs'].map((target) => codeApi.analyzeImpact(target)),
    )

    expect(results[0].not_in_graph).toBe(true)
    expect(results[1]).toMatchObject({ direct_dependents: ['a.rs'], risk_score: 3 })
  })
})
