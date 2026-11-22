/**
 * Reload on a chat URL, against a server that rotates the refresh cookie for
 * real (single use, see src/test/authServerSim.ts). Mounts the real <App/>.
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AuthServerSim, makeLocks } from '@/test/authServerSim'

class FakeWebSocket {
  static OPEN = 1
  readyState = 0
  constructor(public url: string) {}
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

async function bootApp(sim: AuthServerSim, path: string) {
  vi.resetModules()
  window.history.pushState({}, '', path)
  vi.stubGlobal('fetch', sim.fetch)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
  window.matchMedia = globalThis.matchMedia
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {})
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
  Object.defineProperty(navigator, 'locks', { value: makeLocks(), configurable: true })
  const { default: App } = await import('@/App')
  return render(<App />)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('reload on a chat URL', () => {
  let sim: AuthServerSim
  beforeEach(() => {
    sim = new AuthServerSim({ latencyMs: 400 })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('boot: one page load rotates the cookie ONCE (no second rotation after the catalog loader already did)', async () => {
    await bootApp(sim, '/workspace/w1/chat/s1')
    await wait(3000)
    expect(sim.presentations.map((p) => p.cookie)).toEqual(['c0'])
    expect(sim.refusals()).toEqual([])
    expect(window.location.pathname).toBe('/workspace/w1/chat/s1')
  }, 90000)

  it('reload 1 s into a boot does not log the person out', async () => {
    // Page 1 starts booting; the person reloads while its rotation(s) are in flight.
    await bootApp(sim, '/workspace/w1/chat/s1')
    await wait(1000)
    sim.unload() // the page goes away: responses still in flight are dropped
    cleanup()
    sim.newPage()
    await bootApp(sim, '/workspace/w1/chat/s1')
    await wait(3000)
    expect(sim.refusals()).toEqual([])
    expect(window.location.pathname).toBe('/workspace/w1/chat/s1')
  }, 90000)
})
