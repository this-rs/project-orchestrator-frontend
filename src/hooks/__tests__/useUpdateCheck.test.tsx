import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/services/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/env')>()),
  getApiBase: () => '/api',
}))
const updateApi = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), restart: vi.fn() }))
vi.mock('@/services/update', () => ({ updateApi }))
import type { ServerUpdateStatus } from '@/types/update'

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

function serverStatus(over: Partial<ServerUpdateStatus> = {}): ServerUpdateStatus {
  return {
    current: '0.0.15',
    current_build: '0.0.15',
    latest: '0.0.16',
    update_available: true,
    release_url: 'https://gh/r16',
    notes_excerpt: null,
    published_at: null,
    checked_at: null,
    last_error: null,
    check_enabled: true,
    auto_update_enabled: false,
    deployment_mode: 'standalone',
    self_update_supported: true,
    update_hint: 'orchestrator update',
    installing: false,
    install_error: null,
    staged_version: null,
    restart_required: false,
    restart_supported: true,
    ...over,
  }
}

describe('useUpdateCheck — server update service', () => {
  const fetchMock = vi.fn()
  let current: ServerUpdateStatus

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    current = serverStatus()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/version')) return { ok: true, json: async () => ({ version: '0.0.15', update: current }) }
      throw new Error(`unexpected fetch ${url}`)
    })
    updateApi.check.mockReset()
    updateApi.install.mockReset()
    updateApi.restart.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function run() {
    const hook = renderHook(() => useUpdateCheck())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    return hook
  }

  it('uses the server status and never calls GitHub', async () => {
    const { result } = await run()
    expect(result.current.status?.deployment_mode).toBe('standalone')
    expect(result.current.updateAvailable).toBe(true)
    expect(result.current.latestVersion).toBe('0.0.16')
    expect(result.current.currentVersion).toBe('0.0.15')
    expect(result.current.releaseUrl).toBe('https://gh/r16')
    expect(fetchMock.mock.calls.every(([u]) => String(u).endsWith('/version'))).toBe(true)
  })

  it('trusts the server when it says there is nothing newer', async () => {
    current = serverStatus({ update_available: false, latest: '0.0.15' })
    const { result } = await run()
    expect(result.current.updateAvailable).toBe(false)
  })

  it('install applies the returned status', async () => {
    const { result } = await run()
    updateApi.install.mockResolvedValue(serverStatus({ installing: true }))
    await act(async () => {
      await result.current.install()
    })
    expect(updateApi.install).toHaveBeenCalledTimes(1)
    expect(result.current.status?.installing).toBe(true)
    expect(result.current.actionError).toBeNull()
  })

  it('follows an install in progress until the update is staged', async () => {
    current = serverStatus({ installing: true })
    const { result } = await run()
    expect(result.current.status?.installing).toBe(true)
    current = serverStatus({ installing: false, staged_version: '0.0.16', restart_required: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.status?.staged_version).toBe('0.0.16')
    // Polling stops once it is no longer installing.
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('surfaces a refused action to the user', async () => {
    const { result } = await run()
    const { ApiError } = await import('@/services/api')
    updateApi.install.mockRejectedValue(new ApiError(409, JSON.stringify({ error: 'no newer release is known' })))
    await act(async () => {
      await result.current.install()
    })
    expect(result.current.actionError).toBe('no newer release is known')
    expect(result.current.acting).toBe(false)
  })

  it('restart waits for the server to come back with nothing left to restart for', async () => {
    current = serverStatus({ staged_version: '0.0.16', restart_required: true })
    const { result } = await run()
    updateApi.restart.mockResolvedValue({ restarting: true, in_ms: 750 })
    await act(async () => {
      await result.current.restart()
    })
    expect(result.current.restarting).toBe(true)
    // Server down: fetch fails, still restarting.
    fetchMock.mockRejectedValue(new Error('connection refused'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.restarting).toBe(true)
    // Back on the new binary.
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        version: '0.0.16',
        update: serverStatus({ current: '0.0.16', update_available: false, latest: '0.0.16' }),
      }),
    }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.restarting).toBe(false)
    expect(result.current.status?.current).toBe('0.0.16')
  })

  it('gives up waiting for a server that never comes back and says so', async () => {
    current = serverStatus({ staged_version: '0.0.16', restart_required: true })
    const { result } = await run()
    updateApi.restart.mockResolvedValue({ restarting: true, in_ms: 750 })
    await act(async () => {
      await result.current.restart()
    })
    fetchMock.mockRejectedValue(new Error('connection refused'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1000)
    })
    expect(result.current.restarting).toBe(false)
    expect(result.current.actionError).toMatch(/did not come back/)
  })

  it('a failed restart request does not pretend to be restarting', async () => {
    const { result } = await run()
    updateApi.restart.mockRejectedValue(new Error('no supervisor'))
    await act(async () => {
      await result.current.restart()
    })
    expect(result.current.restarting).toBe(false)
    expect(result.current.actionError).toBe('no supervisor')
  })
})
