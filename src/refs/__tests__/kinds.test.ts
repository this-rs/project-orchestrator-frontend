import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../__fixtures__/kinds_response.json'
import { ApiError } from '@/services/api'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api')>()),
  api: { get: getMock },
}))

import {
  HISTORICAL_KINDS,
  actorKinds,
  clearRefKinds,
  ensureRefKinds,
  fetchRefKinds,
  getActiveKinds,
  isActiveKind,
  parseKindsResponse,
  setActiveKinds,
} from '../kinds'
import { validateRefId } from '../ids'

const PID = '00333b5f-2d0a-4467-9c98-155e55d2b7e5'
const SHA = 'fbb4a32c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a'

afterEach(() => {
  clearRefKinds()
  getMock.mockReset()
})

describe('parseKindsResponse (the descriptor route)', () => {
  it('reads the kinds of the backend fixture, in the order the server gave', () => {
    const kinds = parseKindsResponse(fixture.response)
    expect(kinds?.map((k) => k.kind)).toEqual(fixture.response.kinds.map((k) => k.kind))
    expect(kinds?.find((k) => k.kind === 'persona')).toEqual({ kind: 'persona', idFormat: 'uuid', sensitive: true })
    expect(kinds?.find((k) => k.kind === 'commit')?.idFormat).toBe('project_commit')
  })

  it('is null for anything that is not a kinds response (SPA fallback, error body)', () => {
    expect(parseKindsResponse('<!doctype html>')).toBeNull()
    expect(parseKindsResponse({ error: 'x' })).toBeNull()
    expect(parseKindsResponse({ kinds: 'plan' })).toBeNull()
    expect(parseKindsResponse(null)).toBeNull()
  })

  it('drops a malformed entry, an id format it cannot validate and a duplicate, keeps the rest', () => {
    const kinds = parseKindsResponse({
      kinds: [
        { kind: 'plan', id_format: 'uuid', sensitive: false },
        { kind: 'plan', id_format: 'uuid', sensitive: false },
        { kind: 'Weird Kind', id_format: 'uuid' },
        { kind: 'gizmo', id_format: 'telepathy' },
        { kind: 7 },
        'task',
        { kind: 'widget', id_format: 'uuid' },
      ],
    })
    expect(kinds?.map((k) => k.kind)).toEqual(['plan', 'widget'])
    expect(kinds?.[1].sensitive).toBe(false)
  })

  it('an empty list is a server that resolves nothing: it is not the historical fallback', () => {
    expect(parseKindsResponse({ kinds: [] })).toEqual([])
  })
})

describe('fetchRefKinds (capability detection)', () => {
  it('asks the kinds route and returns what it lists', async () => {
    getMock.mockResolvedValue(fixture.response)
    const kinds = await fetchRefKinds()
    expect(getMock.mock.calls[0][0]).toBe('/refs/kinds')
    expect(kinds).toHaveLength(16)
  })

  it('a server without the route (404) offers the five historical kinds and nothing else', async () => {
    getMock.mockRejectedValue(new ApiError(404, 'not found'))
    expect(await fetchRefKinds()).toEqual(HISTORICAL_KINDS)
  })

  it('an HTML fallback (200, not JSON) is the same as a 404', async () => {
    getMock.mockResolvedValue('<!doctype html><html></html>')
    expect(await fetchRefKinds()).toEqual(HISTORICAL_KINDS)
  })

  it('a network error or a 500 is unknown: null, so nothing is cached as a definite answer', async () => {
    getMock.mockRejectedValue(new ApiError(500, 'boom'))
    expect(await fetchRefKinds()).toBeNull()
    getMock.mockRejectedValue(new TypeError('network'))
    expect(await fetchRefKinds()).toBeNull()
  })

  it('ensureRefKinds shares one request per scope, caches a definite answer and retries an unknown one', async () => {
    getMock.mockResolvedValue(fixture.response)
    const [a, b] = await Promise.all([ensureRefKinds('s'), ensureRefKinds('s')])
    expect(a).toBe(b)
    await ensureRefKinds('s')
    expect(getMock).toHaveBeenCalledTimes(1)
    getMock.mockRejectedValue(new ApiError(500, 'x'))
    expect(await ensureRefKinds('other')).toBeNull()
    expect(await ensureRefKinds('other')).toBeNull()
    expect(getMock).toHaveBeenCalledTimes(3)
  })
})

describe('the active kinds', () => {
  it('are the five historical ones until the server says otherwise', () => {
    expect(getActiveKinds().map((k) => k.kind)).toEqual(['plan', 'task', 'note', 'decision', 'rfc'])
    expect(isActiveKind('persona')).toBe(false)
    expect(actorKinds()).toEqual([])
  })

  it('follow the server: persona and skill are the actors once listed', () => {
    setActiveKinds(parseKindsResponse(fixture.response)!)
    expect(isActiveKind('persona')).toBe(true)
    expect(isActiveKind('step')).toBe(false)
    expect(actorKinds()).toEqual(['persona', 'skill'])
  })

  it('a kind the UI has never heard of is offered, generically, and is not an actor', () => {
    setActiveKinds(parseKindsResponse({ kinds: [{ kind: 'widget', id_format: 'uuid', sensitive: false }] })!)
    expect(isActiveKind('widget')).toBe(true)
    expect(actorKinds()).toEqual([])
  })
})

describe('validateRefId (one validator per id format)', () => {
  const uuid = '57cf05c9-25b6-495d-ab07-de4b11d64736'
  it('uuid: a hyphenated, non-nil UUID', () => {
    expect(validateRefId('uuid', uuid)).toBe(true)
    expect(validateRefId('uuid', '00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(validateRefId('uuid', 'nope')).toBe(false)
  })
  it('project_commit: <project uuid>:<40 or 64 hex>', () => {
    expect(validateRefId('project_commit', `${PID}:${SHA}`)).toBe(true)
    expect(validateRefId('project_commit', `${PID}:${SHA}${SHA.slice(0, 24)}`)).toBe(true)
    expect(validateRefId('project_commit', `${PID}:abc123`)).toBe(false)
    expect(validateRefId('project_commit', SHA)).toBe(false)
    expect(validateRefId('project_commit', PID)).toBe(false)
  })
  it('project_path: <project uuid>:<relative, /-separated path>', () => {
    expect(validateRefId('project_path', `${PID}:src/refs/mod.rs`)).toBe(true)
    expect(validateRefId('project_path', `${PID}:a b.rs`)).toBe(true)
    for (const bad of ['', '../x', 'a//b', '/etc/passwd', 'a\\b', 'a/./b', 'a/../b']) {
      expect(validateRefId('project_path', `${PID}:${bad}`), bad).toBe(false)
    }
    expect(validateRefId('project_path', 'src/x.rs')).toBe(false)
  })
  it('url: http(s) only, no credentials, no whitespace', () => {
    expect(validateRefId('url', 'https://example.com/docs?page=2')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@example.com/', 'https://example.com/a b', 'example.com', '']) {
      expect(validateRefId('url', bad), bad).toBe(false)
    }
  })
})
