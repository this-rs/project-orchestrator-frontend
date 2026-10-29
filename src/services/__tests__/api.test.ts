/**
 * apiErrorMessage — the sentence a toast shows.
 *
 * The backend answers errors as `{"error": "..."}` and `ApiError.message`
 * carries that raw body: printed as is, a user reads JSON instead of the
 * reason. Run with: npx vitest run src/services/__tests__/api.test.ts
 */
import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../authManager', () => ({
  getValidToken: () => Promise.resolve('test-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'none' }))
vi.mock('../env', () => ({ isTauri: false, getApiBase: () => '/api' }))

import { api, ApiError, apiErrorMessage, NonJsonResponseError } from '../api'

describe('apiErrorMessage', () => {
  it('unwraps the server sentence from a JSON error body', () => {
    const err = new ApiError(409, '{"error":"An environment named \'dev\' already exists in this project"}')
    expect(apiErrorMessage(err)).toBe("An environment named 'dev' already exists in this project")
  })

  it('keeps a plain-text body as is', () => {
    expect(apiErrorMessage(new ApiError(500, 'Internal error'))).toBe('Internal error')
  })

  it('keeps a JSON body that carries no error field', () => {
    expect(apiErrorMessage(new ApiError(400, '{"detail":"nope"}'))).toBe('{"detail":"nope"}')
  })

  it('falls back when the body is empty or the value is not an error', () => {
    expect(apiErrorMessage(new ApiError(500, ''), 'Could not save')).toBe('Could not save')
    expect(apiErrorMessage(undefined, 'Could not save')).toBe('Could not save')
    expect(apiErrorMessage(new Error(''), 'Could not save')).toBe('Could not save')
  })

  it('passes a non-API error message through', () => {
    expect(apiErrorMessage(new Error('offline'))).toBe('offline')
  })
})

describe('a response that is not JSON', () => {
  afterEach(() => vi.unstubAllGlobals())

  const html = '<!doctype html><html><body>index</body></html>'
  const stub = (status: number, body: string, contentType = 'text/html; charset=utf-8') =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': contentType } })),
    )

  it('a 200 with an HTML page names the request instead of the parser error', async () => {
    stub(200, html)
    const err = await api.get('/chat/providers?project_slug=x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NonJsonResponseError)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(200)
    expect(apiErrorMessage(err)).toBe('The server answered something other than JSON: GET /api/chat/providers → 200 (text/html)')
    expect(apiErrorMessage(err)).not.toMatch(/Unrecognized token|Unexpected token|JSON\.parse/)
  })

  it('an error status with an HTML page keeps its status and gives a readable sentence', async () => {
    stub(502, html)
    const err = await api.post('/chat/providers/test', { id: 'x' }).catch((e: unknown) => e)
    expect((err as ApiError).status).toBe(502)
    expect(apiErrorMessage(err)).toBe('The server answered something other than JSON: POST /api/chat/providers/test → 502 (text/html)')
    expect(apiErrorMessage(err)).not.toContain('<')
  })

  it('a plain-text error body is still passed through', async () => {
    stub(400, 'credential_ref: env variable not declared', 'text/plain')
    const err = await api.post('/chat/providers', { id: 'x' }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(NonJsonResponseError)
    expect(apiErrorMessage(err)).toBe('credential_ref: env variable not declared')
  })

  it('valid JSON still parses', async () => {
    stub(200, '{"ok":true}', 'application/json')
    await expect(api.get('/x')).resolves.toEqual({ ok: true })
  })
})

/**
 * `api.blob` — the binary read a protected file needs.
 *
 * The point of these two assertions is that it is the SAME client as
 * `api.get`: same base, same bearer token, same error type. A thumbnail that
 * authenticated differently from the rest of the app would work in a
 * cookie-only deployment and fail everywhere else.
 */
describe('api.blob', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the bytes and carries the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const blob = await api.blob('/documents/d1/raw')

    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(4)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/documents/d1/raw')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
    expect(init.credentials).toBe('include')
  })

  it('translates a failed read into the same ApiError as the JSON client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('no document d1', { status: 404, headers: { 'content-type': 'text/plain' } }),
      ),
    )
    const err = await api.blob('/documents/d1/raw').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
  })
})
