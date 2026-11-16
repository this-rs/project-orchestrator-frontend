import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
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
})
