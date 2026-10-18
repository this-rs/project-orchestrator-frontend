/**
 * The anchors API client: If-Match on every write, a 409 carries the CURRENT set,
 * and a server without the routes is "unavailable", never a crash.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../authManager', () => ({ getValidToken: () => Promise.resolve(null), refreshToken: vi.fn(), forceLogout: vi.fn() }))
vi.mock('../auth', () => ({ getAuthMode: () => 'none' }))
vi.mock('../env', () => ({ isTauri: false, getApiBase: () => '/api' }))

import { ApiError, NonJsonResponseError } from '../api'
import {
  anchorEventOf,
  anchorsApi,
  AnchorConflictError,
  AnchorRefusedError,
  AnchorsUnavailableError,
  isRouteAbsent,
  parseAnchor,
  parseAnchorSet,
  toAnchorError,
} from '../anchors'

const SID = '11111111-1111-4111-8111-111111111111'
const PLAN = '22222222-2222-4222-8222-222222222222'
const anchor = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  session_id: SID,
  target_type: 'plan',
  target_id: PLAN,
  roles: ['focus'],
  state: 'live',
  by: 'user',
  version: 1,
  snapshot_name: 'Auth flow',
  ...over,
})

function stubFetch(...answers: { status: number; body?: unknown; type?: string }[]) {
  const fetch = vi.fn()
  for (const a of answers) {
    const text = a.body === undefined ? '' : typeof a.body === 'string' ? a.body : JSON.stringify(a.body)
    fetch.mockResolvedValueOnce(new Response(text, { status: a.status, headers: { 'content-type': a.type ?? 'application/json' } }))
  }
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('route absence', () => {
  it('a 404 without a JSON error, a 405, a 501 or an HTML page mean "no such route"', () => {
    expect(isRouteAbsent(new ApiError(404, ''))).toBe(true)
    expect(isRouteAbsent(new ApiError(404, 'Not Found'))).toBe(true)
    expect(isRouteAbsent(new ApiError(405, ''))).toBe(true)
    expect(isRouteAbsent(new ApiError(501, ''))).toBe(true)
    expect(isRouteAbsent(new NonJsonResponseError(200, 'GET', '/x', 'text/html'))).toBe(true)
  })

  it('a 404 with a JSON error is a real "not found" (an unknown session), not an absent route', () => {
    expect(isRouteAbsent(new ApiError(404, '{"error":"Session x not found"}'))).toBe(false)
    expect(isRouteAbsent(new ApiError(500, ''))).toBe(false)
    expect(isRouteAbsent(new Error('offline'))).toBe(false)
  })
})

describe('errors', () => {
  it('a set-version 409 becomes a conflict carrying the current set', () => {
    const err = toAnchorError(
      new ApiError(409, JSON.stringify({ error: 'conflict', code: 'anchor_set_version_conflict', current: { version: 7, anchors: [anchor()] } })),
    )
    expect(err).toBeInstanceOf(AnchorConflictError)
    expect((err as AnchorConflictError).current?.version).toBe(7)
    expect((err as AnchorConflictError).current?.anchors[0].target_id).toBe(PLAN)
  })

  it('any other refusal keeps its status, code and sentence', () => {
    const err = toAnchorError(new ApiError(409, JSON.stringify({ error: 'at most 3', code: 'focus_cap_reached' })))
    expect(err).toBeInstanceOf(AnchorRefusedError)
    expect((err as AnchorRefusedError).code).toBe('focus_cap_reached')
    expect((err as AnchorRefusedError).message).toBe('at most 3')
    const plain = toAnchorError(new ApiError(400, 'bad'))
    expect((plain as AnchorRefusedError).code).toBeNull()
    expect(toAnchorError(new ApiError(405, ''))).toBeInstanceOf(AnchorsUnavailableError)
    const other = new Error('offline')
    expect(toAnchorError(other)).toBe(other)
  })
})

describe('parsing', () => {
  it('drops what is not an anchor and reads an unknown state as `unknown`', () => {
    expect(parseAnchor(null)).toBeNull()
    expect(parseAnchor({ id: 'x' })).toBeNull()
    expect(parseAnchor(anchor({ roles: ['weird'] }))).toBeNull()
    expect(parseAnchor(anchor({ state: 'exploded', by: 'alien' }))).toMatchObject({ state: 'unknown', by: 'system' })
    expect(parseAnchorSet({ version: 3, anchors: [anchor(), { nope: true }] })).toMatchObject({ version: 3, anchors: [{ id: 'a1' }] })
    expect(parseAnchorSet(undefined)).toEqual({ version: 0, anchors: [] })
  })

  it('reads the anchors payload of a chat_session event, and nothing else', () => {
    expect(anchorEventOf({ anchors: { change: 'added', anchor_id: 'a1', target_type: 'plan', target_id: PLAN, version: 4 } })).toEqual({
      change: 'added',
      anchor_id: 'a1',
      target_type: 'plan',
      target_id: PLAN,
      version: 4,
    })
    expect(anchorEventOf({ title: 'x' })).toBeNull()
    expect(anchorEventOf(undefined)).toBeNull()
    expect(anchorEventOf({ anchors: { target_type: 1 } })).toBeNull()
  })
})

describe('anchorsApi', () => {
  it('lists the set of a session', async () => {
    const fetch = stubFetch({ status: 200, body: { session_id: SID, version: 2, anchors: [anchor()] } })
    const set = await anchorsApi.list(SID)
    expect(set.version).toBe(2)
    expect(fetch.mock.calls[0][0]).toBe(`/api/chat/sessions/${SID}/anchors`)
  })

  it('every write carries If-Match with the version read', async () => {
    const fetch = stubFetch(
      { status: 201, body: { anchor: anchor(), created: true, changed: true, version: 3 } },
      { status: 200, body: { anchor: anchor({ roles: ['focus', 'mention'] }), created: false, changed: true, version: 4 } },
      { status: 200, body: { anchor: anchor(), created: false, changed: true, version: 5 } },
    )
    const added = await anchorsApi.add(SID, { target_type: 'plan', target_id: PLAN, roles: ['focus'] }, 2)
    expect(added).toMatchObject({ created: true, version: 3 })
    await anchorsApi.setRole(SID, 'a1', 'promote', 'mention', 3)
    await anchorsApi.remove(SID, 'a1', 4)
    const [, addInit] = fetch.mock.calls[0]
    expect(addInit.method).toBe('POST')
    expect(addInit.headers['If-Match']).toBe('"2"')
    expect(JSON.parse(addInit.body)).toEqual({ target_type: 'plan', target_id: PLAN, roles: ['focus'] })
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PATCH', headers: expect.objectContaining({ 'If-Match': '"3"' }) })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: 'promote', role: 'mention' })
    expect(fetch.mock.calls[2][0]).toBe(`/api/chat/sessions/${SID}/anchors/a1`)
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: 'DELETE', headers: expect.objectContaining({ 'If-Match': '"4"' }) })
  })

  it('a stale write is a conflict with the current set, never retried', async () => {
    const fetch = stubFetch({
      status: 409,
      body: { error: 'stale', code: 'anchor_set_version_conflict', current: { version: 9, anchors: [] } },
    })
    const err = await anchorsApi.remove(SID, 'a1', 4).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AnchorConflictError)
    expect((err as AnchorConflictError).current).toEqual({ version: 9, anchors: [] })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('an older server without the routes answers "unavailable"', async () => {
    stubFetch({ status: 404, body: '', type: 'text/plain' })
    await expect(anchorsApi.list(SID)).rejects.toBeInstanceOf(AnchorsUnavailableError)
    stubFetch({ status: 200, body: '<!doctype html><html></html>', type: 'text/html' })
    await expect(anchorsApi.listAnchoredSessions({ target_type: 'plan', target_id: PLAN })).rejects.toBeInstanceOf(AnchorsUnavailableError)
  })

  it('reads the conversations anchored on one entity, page by page, the limit kept within 1..100', async () => {
    const fetch = stubFetch(
      { status: 200, body: { items: [{ session: { id: 's1' }, anchor: anchor() }, { session: null, anchor: anchor() }], next_cursor: 'c1' } },
      { status: 200, body: { items: [] } },
    )
    const page = await anchorsApi.listAnchoredSessions({ target_type: 'plan', target_id: PLAN, limit: 500 })
    expect(page.items).toHaveLength(1)
    expect(page.next_cursor).toBe('c1')
    expect(fetch.mock.calls[0][0]).toBe(`/api/chat/anchored-sessions?target_type=plan&target_id=${PLAN}&limit=100`)
    const last = await anchorsApi.listAnchoredSessions({ target_type: 'plan', target_id: PLAN, cursor: 'c1', limit: 0 })
    expect(last).toEqual({ items: [] })
    expect(fetch.mock.calls[1][0]).toContain('cursor=c1')
    expect(fetch.mock.calls[1][0]).toContain('limit=1')
  })

  it('a malformed change answer is a refusal, not a crash', async () => {
    stubFetch({ status: 200, body: { nothing: true } })
    await expect(anchorsApi.add(SID, { target_type: 'plan', target_id: PLAN })).rejects.toBeInstanceOf(AnchorRefusedError)
  })
})
