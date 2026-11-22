import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../authManager', () => ({
  getValidToken: vi.fn().mockResolvedValue('refreshed-token'),
  refreshToken: vi.fn(),
  forceLogout: vi.fn(),
}))
vi.mock('../auth', () => ({ getAuthMode: () => 'required', getAuthToken: () => 'current-token' }))
// The ordinary API retries failed startup requests in the desktop client.
vi.mock('../env', () => ({ isTauri: true, getApiBase: () => '/api' }))

import { chatApi } from '../chat'
import { getValidToken, refreshToken, forceLogout } from '../authManager'
import { RequestIdentityChangedError } from '../api'

describe('cancelTask single attempt', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('sends the current bearer once to the encoded target, without refreshing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task_id: 'a/b', killed_pids: [], capped: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const guard = vi.fn(() => true)
    await expect(chatApi.cancelTask('s1', 'a/b', guard)).resolves.toMatchObject({ task_id: 'a/b' })
    expect(guard).toHaveBeenCalledWith('current-token')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/sessions/s1/cancel-task/a%2Fb')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include', headers: { Authorization: 'Bearer current-token' } })
    expect(getValidToken).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
  })

  it.each(['network', '401'])('does not retry or refresh after %s', async (failure) => {
    const fetchMock = failure === 'network'
      ? vi.fn().mockRejectedValue(new TypeError('connection lost'))
      : vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatApi.cancelTask('s1', 'task', () => true)).rejects.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getValidToken).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
    expect(forceLogout).not.toHaveBeenCalled()
  })

  it('does not send when the identity guard refuses', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatApi.cancelTask('s1', 'task', () => false)).rejects.toBeInstanceOf(RequestIdentityChangedError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getValidToken).not.toHaveBeenCalled()
  })
})
