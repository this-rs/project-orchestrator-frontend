/**
 * getValidToken — the refresh must never freeze the app.
 *
 * Bug (measured on dev, 2026-10-31): every request awaited `getValidToken()`,
 * which awaited `POST /auth/refresh` whenever the token was within 30 s of its
 * expiry. When that endpoint waited 39–57 s for a free Neo4j connection, the
 * whole UI stopped — even though the access token in memory was still valid.
 *
 * The fix: rotate in the background while the current token is still valid, and
 * only make a caller wait when the token has genuinely expired.
 *
 * Run with: npx vitest run src/services/__tests__/authManager.getValidToken.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  token: null as string | null,
  refreshCalls: 0,
  refreshDelayMs: 0,
}

/** A JWT-shaped string whose payload only carries `exp`, as `parseJwtExp` reads it. */
function makeToken(ttlSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${payload}.signature`
}

vi.mock('../auth', () => ({
  getAuthMode: () => 'required',
  getAuthToken: () => state.token,
  setAuthToken: (token: string | null) => {
    state.token = token
  },
  authApi: {
    refresh: vi.fn(async () => {
      state.refreshCalls += 1
      if (state.refreshDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, state.refreshDelayMs))
      }
      return { token: makeToken(3600) }
    }),
    logout: vi.fn(),
  },
}))

vi.mock('../eventBus', () => ({
  getEventBus: () => ({ disconnect: vi.fn() }),
}))

describe('getValidToken — a slow refresh must not block callers', () => {
  beforeEach(() => {
    vi.resetModules()
    state.refreshCalls = 0
    state.refreshDelayMs = 0
    state.token = null
  })

  it('returns the current token immediately when it is near expiry but still valid', async () => {
    state.token = makeToken(10) // under the 30 s threshold, but not expired
    state.refreshDelayMs = 200 // a refresh that takes a while, like a saturated pool

    const { getValidToken } = await import('../authManager')
    const started = Date.now()
    const token = await getValidToken()
    const elapsed = Date.now() - started

    // The caller did not wait for the rotation...
    expect(elapsed).toBeLessThan(100)
    expect(token).toBe(state.token)
    // ...but the rotation was started, once.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.refreshCalls).toBe(1)
  })

  it('waits for the refresh when the token has genuinely expired', async () => {
    const expired = makeToken(-10)
    state.token = expired
    state.refreshDelayMs = 50

    const { getValidToken } = await import('../authManager')
    const token = await getValidToken()

    expect(state.refreshCalls).toBe(1)
    expect(token).not.toBeNull()
    expect(token).not.toBe(expired)
    // ...and the in-memory cache now holds the rotated token.
    expect(token).toBe(state.token)
  })

  it('does not refresh a token that is far from expiry', async () => {
    state.token = makeToken(3600)

    const { getValidToken } = await import('../authManager')
    const token = await getValidToken()

    expect(token).toBe(state.token)
    expect(state.refreshCalls).toBe(0)
  })

  it('refreshes once per burst, not once per caller', async () => {
    state.token = makeToken(10)
    state.refreshDelayMs = 30

    const { getValidToken } = await import('../authManager')
    await Promise.all([getValidToken(), getValidToken(), getValidToken()])
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(state.refreshCalls).toBe(1)
  })
})
