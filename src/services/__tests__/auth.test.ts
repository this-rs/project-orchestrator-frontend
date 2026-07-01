/**
 * Regression tests for the OAuth origin fix.
 *
 * Bug (fixed in this commit): `getOAuthOrigin()` used to return `null` for
 * every non-Tauri (browser) caller. That meant the backend never learned
 * which host the user was actually browsing from, so it always redirected
 * back to the single static `redirect_uri` configured server-side — any
 * other frontend origin (e.g. a dev subdomain) got bounced to the wrong
 * host after SSO with no session cookie for the origin the user started on.
 *
 * These tests pin down the request-building behavior directly (rather than
 * the private `getOAuthOrigin()`, which isn't exported) since that's the
 * actual contract that matters: what does the browser send to the backend.
 *
 * Run with: npx vitest run src/services/__tests__/auth.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('authApi OAuth origin (browser / non-Tauri)', () => {
  const originalFetch = global.fetch
  const originalLocation = window.location

  beforeEach(() => {
    vi.resetModules()
    // jsdom's default test origin — see vitest.config.ts (environment: 'jsdom').
    // We override explicitly so the assertion doesn't silently depend on
    // whatever jsdom's default happens to be.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: 'https://dev.ffs.dev' },
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('getOidcAuthUrl() sends the browser\'s actual window.location.origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://accounts.google.com/...' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { authApi } = await import('../auth')
    await authApi.getOidcAuthUrl()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain(`origin=${encodeURIComponent('https://dev.ffs.dev')}`)
  })

  it('exchangeOidcCode() includes window.location.origin in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt', user: { id: '1', email: 'a@b.com' } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { authApi } = await import('../auth')
    await authApi.exchangeOidcCode('some-code')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ code: 'some-code', origin: 'https://dev.ffs.dev' })
  })

  it('never sends origin=null for a browser session (the regressed behavior)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt', user: { id: '1', email: 'a@b.com' } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { authApi } = await import('../auth')
    await authApi.exchangeOidcCode('some-code')

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.origin).not.toBeNull()
    expect(typeof body.origin).toBe('string')
  })
})
