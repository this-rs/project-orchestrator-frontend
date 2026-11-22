import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../authManager', () => ({
  getValidToken: vi.fn().mockResolvedValue('test-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'required' }))
// Exercise the Tauri startup state, where ordinary calls retry network failures.
vi.mock('../env', () => ({ isTauri: true, getApiBase: () => '/api' }))

import { api } from '../api'
import { refreshToken, forceLogout } from '../authManager'

describe('postOnce', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('keeps common authentication but never retries a network error at startup', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('connection lost'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.postOnce('/chat/sessions/s1/cancel-tools', {})).rejects.toThrow('connection lost')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  it('does not refresh, retry or log out automatically on a 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.postOnce('/chat/sessions/s1/cancel-tools', {})).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshToken).not.toHaveBeenCalled()
    expect(forceLogout).not.toHaveBeenCalled()
  })
})
