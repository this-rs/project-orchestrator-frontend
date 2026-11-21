import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { refresh, logout, setAuthToken } = vi.hoisted(() => ({
  refresh: vi.fn(),
  logout: vi.fn(),
  setAuthToken: vi.fn(),
}))

vi.mock('../auth', () => ({
  getAuthMode: () => 'required',
  getAuthToken: () => null,
  setAuthToken,
  authApi: { refresh, logout },
}))
vi.mock('../eventBus', () => ({ getEventBus: () => ({ disconnect: vi.fn() }) }))

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')

function installLock() {
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_name: string, action: () => Promise<unknown>) => {
    const next = tail.then(action)
    tail = next.catch(() => {})
    return next
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return request
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('shared refresh cookie', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    logout.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
    else Reflect.deleteProperty(navigator, 'locks')
  })

  it('serializes independent tabs until the first rotation has completed', async () => {
    const request = installLock()
    const first = deferred<{ token: string }>()
    refresh.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ token: 'second' })
    const tabA = await import('../authManager')
    vi.resetModules()
    const tabB = await import('../authManager')

    const a = tabA.refreshToken()
    const b = tabB.refreshToken()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledTimes(2)
    first.resolve({ token: 'first' })

    await expect(a).resolves.toBe('first')
    await expect(b).resolves.toBe('second')
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('still refreshes when Web Locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    refresh.mockResolvedValueOnce({ token: 'token' })
    const { refreshToken } = await import('../authManager')

    await expect(refreshToken()).resolves.toBe('token')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('revokes the rotated cookie after logout during an in-flight refresh', async () => {
    installLock()
    const pending = deferred<{ token: string }>()
    refresh.mockReturnValueOnce(pending.promise)
    const { refreshToken, forceLogout, setNavigate } = await import('../authManager')
    setNavigate(vi.fn())
    const result = refreshToken()
    const rejection = expect(result).rejects.toThrow('Authentication changed')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    forceLogout()
    expect(logout).not.toHaveBeenCalled()
    pending.resolve({ token: 'new token' })
    await rejection
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(setAuthToken).not.toHaveBeenCalledWith('new token')
  })

  it('waits for its own in-flight refresh before logout without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    const pending = deferred<{ token: string }>()
    refresh.mockReturnValueOnce(pending.promise)
    const { refreshToken, forceLogout, setNavigate } = await import('../authManager')
    setNavigate(vi.fn())
    const rejection = expect(refreshToken()).rejects.toThrow('Authentication changed')

    forceLogout()
    expect(logout).not.toHaveBeenCalled()
    pending.resolve({ token: 'new token' })
    await rejection
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(setAuthToken).not.toHaveBeenCalledWith('new token')
  })

  it('treats a lock failure during logout as best-effort', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: () => Promise.reject(new Error('lock unavailable')) },
    })
    const { forceLogout, setNavigate } = await import('../authManager')
    const navigate = vi.fn()
    setNavigate(navigate)

    forceLogout()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(navigate).toHaveBeenCalledWith('/login')
  })
})
