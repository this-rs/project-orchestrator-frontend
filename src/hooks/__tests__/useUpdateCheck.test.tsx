import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/services/env', () => ({ getApiBase: () => '/api' }))

import { useUpdateCheck, parseSemver, isNewer, isDismissed } from '../useUpdateCheck'

describe('parseSemver / isNewer', () => {
  it('parses plain, v-prefixed, pre-release and build versions', () => {
    expect(parseSemver('1.2.3')?.core).toEqual([1, 2, 3])
    expect(parseSemver('v0.0.16')?.core).toEqual([0, 0, 16])
    expect(parseSemver('0.1.0-rc1')?.prerelease).toBe(true)
    expect(parseSemver('0.1.0+abc')?.prerelease).toBe(false)
    expect(parseSemver('nope')).toBeNull()
    expect(parseSemver('1.2')).toBeNull()
  })

  it('orders by major, minor, patch', () => {
    expect(isNewer('0.0.15', '0.0.16')).toBe(true)
    expect(isNewer('0.0.16', '0.0.16')).toBe(false)
    expect(isNewer('0.1.0', '0.0.16')).toBe(false)
    expect(isNewer('0.9.9', '1.0.0')).toBe(true)
    expect(isNewer('1.2.0', '1.10.0')).toBe(true)
  })

  it('treats a pre-release as older than its release, and never fires on garbage', () => {
    expect(isNewer('0.1.0-rc1', '0.1.0')).toBe(true)
    expect(isNewer('0.1.0', '0.1.0-rc1')).toBe(false)
    expect(isNewer('0.1.0-rc1', '0.0.16')).toBe(false)
    expect(isNewer('garbage', '1.0.0')).toBe(false)
  })
})

describe('isDismissed', () => {
  beforeEach(() => localStorage.clear())

  it('honours the version and the 24h TTL', () => {
    const now = Date.now()
    localStorage.setItem('orchestrator-update-dismissed', JSON.stringify({ version: '1.0.0', timestamp: now }))
    expect(isDismissed('1.0.0')).toBe(true)
    expect(isDismissed('1.0.1')).toBe(false)
    localStorage.setItem(
      'orchestrator-update-dismissed',
      JSON.stringify({ version: '1.0.0', timestamp: now - 25 * 3600 * 1000 }),
    )
    expect(isDismissed('1.0.0')).toBe(false)
    localStorage.setItem('orchestrator-update-dismissed', '{bad')
    expect(isDismissed('1.0.0')).toBe(false)
  })
})

describe('useUpdateCheck', () => {
  const fetchMock = vi.fn()

  function route(server: string, tag: string | null) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/version')) return { ok: true, json: async () => ({ version: server }) }
      if (tag === null) return { ok: false }
      return { ok: true, json: async () => ({ tag_name: tag, html_url: 'https://gh/r', body: null }) }
    })
  }

  async function run() {
    const hook = renderHook(() => useUpdateCheck())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    return hook
  }

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does nothing before the 5s delay', () => {
    route('0.0.15', 'v0.0.16')
    renderHook(() => useUpdateCheck())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an update when GitHub is ahead of the server', async () => {
    route('0.0.15', 'v0.0.16')
    const { result } = await run()
    expect(result.current.updateAvailable).toBe(true)
    expect(result.current.latestVersion).toBe('0.0.16')
    expect(result.current.currentVersion).toBe('0.0.15')
    expect(result.current.releaseUrl).toBe('https://gh/r')
    expect(result.current.dismissed).toBe(false)
  })

  it('reports nothing when up to date', async () => {
    route('0.0.16', 'v0.0.16')
    const { result } = await run()
    expect(result.current.updateAvailable).toBe(false)
  })

  it('dismiss persists for that version and a fresh mount starts dismissed', async () => {
    route('0.0.15', 'v0.0.16')
    const first = await run()
    act(() => first.result.current.dismiss())
    expect(first.result.current.dismissed).toBe(true)
    first.unmount()
    const second = await run()
    expect(second.result.current.updateAvailable).toBe(true)
    expect(second.result.current.dismissed).toBe(true)
  })

  it('stays silent when GitHub or the version endpoint fails', async () => {
    route('0.0.15', null)
    const a = await run()
    expect(a.result.current.updateAvailable).toBe(false)
    fetchMock.mockRejectedValue(new Error('offline'))
    const b = await run()
    expect(b.result.current.updateAvailable).toBe(false)
    expect(b.result.current.loading).toBe(false)
  })

  it('is disabled inside Tauri', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    try {
      route('0.0.15', 'v0.0.16')
      await run()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    }
  })

  it('re-checks every 24h', async () => {
    route('0.0.16', 'v0.0.16')
    await run()
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 3600 * 1000)
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls)
  })
})
