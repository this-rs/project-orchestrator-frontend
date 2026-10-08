import { describe, expect, it, vi } from 'vitest'
import search from '../__fixtures__/search_response.json'
import errors from '../__fixtures__/errors.json'
import { ApiError } from '@/services/api'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api')>()),
  api: { get: getMock },
}))

import { parseSearchResponse, readRefsInvalid, refsApi } from '../refsApi'

describe('parseSearchResponse (golden search_response.json)', () => {
  it('reads every item of the fixture, with its optional fields', () => {
    const items = parseSearchResponse(search.response)
    expect(items.map((i) => i.kind)).toEqual(['plan', 'task', 'rfc'])
    expect(items[0]).toMatchObject({
      label: 'Chat : références #/@',
      subtitle: '12 tâches',
      entity_status: 'in_progress',
      project: { slug: 'project-orchestrator' },
      workspace: { slug: 'po' },
    })
    expect(items[2].subtitle).toBeUndefined()
  })

  it('reads the empty response, and nothing from a malformed one', () => {
    expect(parseSearchResponse(search.empty_response)).toEqual([])
    expect(parseSearchResponse(null)).toEqual([])
    expect(parseSearchResponse({ items: 'x' })).toEqual([])
    // the note said `results`: the golden fixture says `items`
    expect(parseSearchResponse({ results: search.response.items })).toEqual([])
  })

  it('drops an item of a reserved kind or without a label', () => {
    expect(
      parseSearchResponse({ items: [{ kind: 'persona', id: 'x', label: 'p' }, { kind: 'plan', id: 'x' }, 7] }),
    ).toEqual([])
  })
})

describe('refsApi.search', () => {
  it('asks GET /refs/search with the query, the kinds when narrowed, and the signal', async () => {
    getMock.mockResolvedValue(search.response)
    const signal = new AbortController().signal
    const items = await refsApi.search({ q: 'refs', kinds: ['plan', 'task', 'rfc'], limit: 20 }, signal)
    expect(getMock).toHaveBeenCalledWith('/refs/search?q=refs&kinds=plan%2Ctask%2Crfc&limit=20', signal)
    expect(items).toHaveLength(3)
  })

  it('omits kinds when all five are asked, and q when empty', async () => {
    getMock.mockResolvedValue(search.empty_response)
    await refsApi.search({ q: '', kinds: ['plan', 'task', 'note', 'decision', 'rfc'] })
    expect(getMock).toHaveBeenLastCalledWith('/refs/search', undefined)
  })
})

describe('readRefsInvalid (golden errors.json)', () => {
  for (const c of errors.cases) {
    it(`reads "${c.name}"`, () => {
      const err = new ApiError(errors.http_status, JSON.stringify(c.body))
      expect(readRefsInvalid(err)).toEqual({
        reason: c.body.reason,
        message: c.body.error,
        ...('index' in c.body ? { index: c.body.index } : {}),
      })
      expect(errors.reasons).toContain(c.body.reason)
    })
  }

  it('is null for any other error', () => {
    expect(readRefsInvalid(new ApiError(500, 'boom'))).toBeNull()
    expect(readRefsInvalid(new ApiError(400, JSON.stringify({ error: 'x' })))).toBeNull()
    expect(readRefsInvalid(new Error('x'))).toBeNull()
  })
})
