/**
 * Tests for boot-critical env helpers: bootTimeoutSignal + fetchSetupStatus.
 *
 * These guard the app-boot spinner path (SetupGuard): every fetch here must
 * carry an abort signal so a stalled connection can never hang the boot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bootTimeoutSignal, fetchSetupStatus } from '../env'

describe('bootTimeoutSignal', () => {
  it('returns an AbortSignal when AbortSignal.timeout is available', () => {
    const signal = bootTimeoutSignal()
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
  })

  it('returns a fresh signal on every call (signals are single-use)', () => {
    const a = bootTimeoutSignal()
    const b = bootTimeoutSignal()
    expect(a).not.toBe(b)
  })
})

describe('fetchSetupStatus', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('passes an abort signal to fetch (boot must never hang)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: true }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchSetupStatus()

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns the configured flag from the backend', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: false }),
    }) as unknown as typeof fetch

    expect(await fetchSetupStatus()).toBe(false)
  })

  it('returns null on a non-ok response (caller assumes configured)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch

    expect(await fetchSetupStatus()).toBe(null)
  })

  it('returns null when fetch rejects (backend unreachable / timeout abort)', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')) as unknown as typeof fetch

    expect(await fetchSetupStatus()).toBe(null)
  })
})
