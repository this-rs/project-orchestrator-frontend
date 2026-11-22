import { describe, expect, it, vi } from 'vitest'
import { isDefinitiveRefusal, refreshAtBoot } from '../bootRefresh'

const noSleep = () => Promise.resolve()
const status = (code: number) => Object.assign(new Error(`HTTP ${code}`), { status: code })

describe('refreshAtBoot', () => {
  it('returns the token on the first try without waiting', async () => {
    const sleep = vi.fn(noSleep)
    await expect(refreshAtBoot(async () => 'jwt', [10, 20], sleep)).resolves.toBe('jwt')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('treats 401 and 403 as a refusal: no retry, the error is passed on', async () => {
    for (const code of [401, 403]) {
      const refresh = vi.fn(async () => { throw status(code) })
      await expect(refreshAtBoot(refresh, [10, 20], noSleep)).rejects.toMatchObject({ status: code })
      expect(refresh).toHaveBeenCalledTimes(1)
    }
  })

  it('retries a 503, a network error and a timeout, and succeeds when the server is back', async () => {
    const refresh = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(status(503))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce('jwt')
    const sleeps: number[] = []
    await expect(
      refreshAtBoot(refresh, [1_000, 3_000, 8_000], async (ms) => { sleeps.push(ms) }),
    ).resolves.toBe('jwt')
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1_000, 3_000])
  })

  it('gives up after the last delay and rejects with the failure, not a refusal', async () => {
    const refresh = vi.fn(async () => { throw status(503) })
    await expect(refreshAtBoot(refresh, [1, 2], noSleep)).rejects.toMatchObject({ status: 503 })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('isDefinitiveRefusal only recognises an answer that says the cookie does not work', () => {
    expect(isDefinitiveRefusal(status(401))).toBe(true)
    expect(isDefinitiveRefusal(status(403))).toBe(true)
    expect(isDefinitiveRefusal(status(500))).toBe(false)
    expect(isDefinitiveRefusal(status(503))).toBe(false)
    expect(isDefinitiveRefusal(new TypeError('Failed to fetch'))).toBe(false)
    expect(isDefinitiveRefusal(null)).toBe(false)
    expect(isDefinitiveRefusal(undefined)).toBe(false)
  })
})
