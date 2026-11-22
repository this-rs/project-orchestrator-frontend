import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { authModeAtom, authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'

const auth = vi.hoisted(() => ({ mode: 'required' as 'required' | 'none', token: null as string | null }))
vi.mock('@/services/auth', () => ({ getAuthMode: () => auth.mode, getAuthToken: () => auth.token }))
vi.mock('@/services/authManager', () => ({
  getValidToken: vi.fn(), refreshToken: vi.fn(), forceLogout: vi.fn(),
  parseJwtExp: (token: string) => {
    try { return JSON.parse(atob(token.split('.')[1])).exp ?? null } catch { return null }
  },
}))
vi.mock('@/services/env', () => ({ isTauri: false, getApiBase: () => '/api' }))

import { getValidToken, refreshToken } from '@/services/authManager'
import { CancelAllTools } from './CancelAllTools'

const jwt = (subject: string, exp = Math.floor(Date.now() / 1000) + 3600) => `header.${btoa(JSON.stringify({ sub: subject, exp }))}.signature`
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Stop all tools in this session' }))
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Send interruption to all tools' }))

function mount() {
  const store = createStore()
  store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' })
  store.set(authModeConfirmedAtom, true)
  return { ...render(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>), store }
}

describe('cancel all tools authenticated preflight', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.mode = 'required'; auth.token = jwt('user-a') })
  afterEach(() => vi.unstubAllGlobals())

  it('does not refresh or POST when A token expired even if the shared cookie could return B', async () => {
    auth.token = jwt('user-a', Math.floor(Date.now() / 1000) - 1)
    vi.mocked(getValidToken).mockResolvedValueOnce(jwt('user-b'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mount(); open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getValidToken).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
  })

  it.each([null, 'malformed-token', jwt('user-b')])('rejects an unverifiable Bearer without sending a POST', async (token) => {
    auth.token = token
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mount(); open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getValidToken).not.toHaveBeenCalled()
  })

  it('does not send when the provider auth mode was not confirmed', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { store } = mount()
    act(() => store.set(authModeConfirmedAtom, false))
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the verified A Bearer once without refreshing when the identity stays stable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ capped: false, killed_pids: [], cli_pid: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mount(); open(); confirm()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${jwt('user-a')}`)
    expect(getValidToken).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
  })

  it('keeps a sent POST awaiting acknowledgement after A → B → A, without showing it to B', async () => {
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn().mockReturnValueOnce(new Promise((r) => { resolve = r }))
    vi.stubGlobal('fetch', fetchMock)
    const { store } = mount()
    open(); confirm()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sending interruption')
    await act(() => resolve(new Response(JSON.stringify({ capped: false, killed_pids: [1], cli_pid: null }), { status: 200 })))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('does not guarantee processes stopped'))
    expect(screen.getByRole('button', { name: 'I checked this session — allow another request' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('permits explicitly confirmed no-auth mode without a Bearer', async () => {
    auth.mode = 'none'
    auth.token = null
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ capped: false, killed_pids: [], cli_pid: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { store } = mount()
    act(() => { store.set(currentUserAtom, null); store.set(authModeAtom, 'none') })
    open(); confirm()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('times out once, aborts locally, and keeps the uncertain outcome across navigation and a late response', async () => {
    vi.useFakeTimers()
    try {
      let resolve!: (response: Response) => void
      // Simulate a fetch implementation that does not settle when aborted.
      const fetchMock = vi.fn().mockReturnValueOnce(new Promise((r) => { resolve = r }))
      vi.stubGlobal('fetch', fetchMock)
      const { store, rerender } = mount()
      open(); confirm()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
      rerender(<Provider store={store}><CancelAllTools sessionId="s2" available /></Provider>)
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
      expect(signal.aborted).toBe(true)
      expect(screen.queryByRole('status')).toBeNull()
      rerender(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>)
      expect(screen.getByRole('status')).toHaveTextContent('outcome is unknown')
      fireEvent.click(screen.getByRole('button', { name: 'I checked this session — allow another request' }))
      await act(() => resolve(new Response(JSON.stringify({ capped: false, killed_pids: [1], cli_pid: null }), { status: 200 })))
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
