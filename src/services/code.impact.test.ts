import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, NonJsonResponseError } from './api'
import { codeApi } from './code'

// The bodies exactly as the backend sends them (`AppError::NotFound` →
// `{"error": "..."}`, code_handlers.rs `resolve_impact_target`): `ApiError`
// carries the raw body as its message.
const NOT_IN_GRAPH_BODY = JSON.stringify({
  error:
    "file not found in graph: 'src/unknown.rs' (looked up as /repo/app/src/unknown.rs). Pass an absolute path, or project_slug with a path relative to the project root; sync the project if the file is new.",
})
const OUTSIDE_PROJECT_BODY = JSON.stringify({
  error:
    "file not found in graph for this project: 'src/other.rs' is a file of the graph, but not of this project (it lies under another project's root, or belongs to another project).",
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('codeApi.analyzeImpact', () => {
  it('turns the 404 of an unknown file into an empty result, not an exception', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      new ApiError(404, NOT_IN_GRAPH_BODY),
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

  it('keeps the 404 of a file of ANOTHER project an error: it is in the graph, the target is wrong', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(404, OUTSIDE_PROJECT_BODY))

    await expect(codeApi.analyzeImpact('src/other.rs')).rejects.toMatchObject({
      status: 404,
      message: OUTSIDE_PROJECT_BODY,
    })
  })

  it('keeps an unauthorized answer an error', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(401, 'Session expired'))

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(ApiError)
  })

  it('keeps a network failure an error', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(TypeError)
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
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(404, JSON.stringify({ error: 'Project not found: app' })))

    await expect(codeApi.analyzeImpact('src/lib.rs')).rejects.toBeInstanceOf(ApiError)
  })

  it('composes with the array path: one unknown target does not reject the batch', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new ApiError(404, NOT_IN_GRAPH_BODY))
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
