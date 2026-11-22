/**
 * H1 at the authManager level: a rotation started while the page unloads.
 * Server: single-use rotation (src/test/authServerSim.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthServerSim, makeLocks } from '@/test/authServerSim'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function freshPage(sim: AuthServerSim) {
  vi.resetModules()
  vi.stubGlobal('fetch', sim.fetch)
  Object.defineProperty(navigator, 'locks', { value: makeLocks(), configurable: true })
  const auth = await import('@/services/auth')
  const mgr = await import('@/services/authManager')
  auth.setAuthMode('required')
  return { auth, mgr }
}

describe('rotation in flight when the page goes away', () => {
  let sim: AuthServerSim
  beforeEach(() => {
    // The access token expires in 20 s: getValidToken() rotates in the background.
    sim = new AuthServerSim({ latencyMs: 400, accessTtlS: 20 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  async function runningPageThenReload(opts: { hide: boolean }) {
    const { auth, mgr } = await freshPage(sim)
    auth.setAuthToken(sim.mintJwt()) // a page that is already signed in
    if (opts.hide) window.dispatchEvent(new Event('pagehide'))
    await mgr.getValidToken() // near expiry -> background rotation (unless the page is hiding)
    await wait(100)
    sim.unload() // reload: the response in flight is lost
    sim.newPage()
    const next = await freshPage(sim)
    let outcome: 'ok' | 'refused' = 'ok'
    try {
      await next.mgr.refreshToken()
    } catch {
      outcome = 'refused'
    }
    return { outcome }
  }

  it('a page that is hiding does not start a background rotation', async () => {
    const { outcome } = await runningPageThenReload({ hide: true })
    expect(sim.presentations.map((p) => p.status)).toEqual([200]) // only the new page's boot refresh
    expect(outcome).toBe('ok')
  })

  it('H1: without that guard AND without a server grace window, the cookie is lost (documents the residual risk)', async () => {
    const { outcome } = await runningPageThenReload({ hide: false })
    expect(sim.presentations.map((p) => p.status)).toEqual([200, 401])
    expect(outcome).toBe('refused')
  })

  it('H1: a server grace window recovers a rotation whose response was lost', async () => {
    sim = new AuthServerSim({ latencyMs: 400, accessTtlS: 20, graceMs: 60_000 })
    const { outcome } = await runningPageThenReload({ hide: false })
    expect(outcome).toBe('ok')
  })
})

describe('setJotaiSetter hands the in-memory token to Jotai', () => {
  afterEach(() => vi.unstubAllGlobals())

  async function page() {
    const sim = new AuthServerSim({ latencyMs: 0, accessTtlS: 3600 })
    const { auth, mgr } = await freshPage(sim)
    const setToken = vi.fn()
    return { sim, auth, mgr, setToken, setUser: vi.fn() }
  }

  it('a valid token already in memory reaches Jotai at mount: no second rotation', async () => {
    const { sim, auth, mgr, setToken, setUser } = await page()
    auth.setAuthToken(sim.mintJwt())
    mgr.setJotaiSetter({ setToken, setUser })
    expect(setToken).toHaveBeenCalledTimes(1)
    expect(setToken).toHaveBeenCalledWith(auth.getAuthToken())
  })

  it('an expired token stays out of Jotai, so the boot refresh runs (once) instead of a 401 on /auth/me', async () => {
    const { auth, mgr, setToken, setUser } = await page()
    const expired = `h.${btoa(JSON.stringify({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 5 }))}.s`
    auth.setAuthToken(expired)
    mgr.setJotaiSetter({ setToken, setUser })
    expect(setToken).not.toHaveBeenCalled()
  })

  it('no token in memory: nothing is pushed', async () => {
    const { mgr, setToken, setUser } = await page()
    mgr.setJotaiSetter({ setToken, setUser })
    expect(setToken).not.toHaveBeenCalled()
  })
})
