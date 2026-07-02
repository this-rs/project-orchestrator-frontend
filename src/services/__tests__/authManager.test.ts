/**
 * Regression tests for the login redirect-loop fix.
 *
 * Bug (fixed in this commit): `forceLogout()` navigated to `/login`
 * unconditionally. On the public `/login` route, `ProtectedRoute` never
 * mounts, so `_navigate` is never injected and `forceLogout()` fell back to
 * `window.location.href = '/login'` — a full page reload. Any background
 * request that keeps 401ing with no valid session (e.g. the always-mounted
 * model catalog loader hitting `/chat/models`) therefore reloaded the page
 * forever.
 *
 * The fix short-circuits `forceLogout()` when already on `/login`.
 *
 * Run with: npx vitest run src/services/__tests__/authManager.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the collaborators so forceLogout can run in isolation.
vi.mock('../auth', () => ({
  getAuthMode: () => 'required',
  getAuthToken: () => null,
  setAuthToken: vi.fn(),
  authApi: { logout: vi.fn() },
}))
vi.mock('../eventBus', () => ({
  getEventBus: () => ({ disconnect: vi.fn() }),
}))

const originalLocation = window.location

function setPathname(pathname: string) {
  const hrefSetter = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...originalLocation,
      pathname,
      get href() {
        return `https://app.test${pathname}`
      },
      set href(v: string) {
        hrefSetter(v)
      },
    },
  })
  return hrefSetter
}

describe('forceLogout — redirect-loop guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('does NOT navigate or hard-reload when already on /login', async () => {
    const hrefSetter = setPathname('/login')
    const { forceLogout } = await import('../authManager')

    forceLogout()

    // No hard reload triggered — the loop is broken.
    expect(hrefSetter).not.toHaveBeenCalled()
  })

  it('does NOT navigate or hard-reload during an SSO exchange on /auth/callback', async () => {
    // Regression: background requests 401 while the single-use OAuth code is
    // being exchanged; a logout navigation here aborts the exchange and the
    // consumed code makes every retry fail (invalid_grant) — login loop.
    const hrefSetter = setPathname('/auth/callback')
    const { forceLogout, setNavigate } = await import('../authManager')
    const navigate = vi.fn()
    setNavigate(navigate)

    forceLogout()

    expect(hrefSetter).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('hard-reloads to /login when elsewhere and no navigate is injected', async () => {
    const hrefSetter = setPathname('/workspace/foo/overview')
    const { forceLogout } = await import('../authManager')

    forceLogout()

    expect(hrefSetter).toHaveBeenCalledWith('/login')
  })

  it('uses injected navigate (no hard reload) when elsewhere', async () => {
    const hrefSetter = setPathname('/workspace/foo/overview')
    const { forceLogout, setNavigate } = await import('../authManager')
    const navigate = vi.fn()
    setNavigate(navigate)

    forceLogout()

    expect(navigate).toHaveBeenCalledWith('/login')
    expect(hrefSetter).not.toHaveBeenCalled()
  })
})
