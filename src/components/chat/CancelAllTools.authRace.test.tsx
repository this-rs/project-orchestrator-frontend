import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'

vi.mock('@/services/auth', () => ({ getAuthMode: () => 'required' }))
vi.mock('@/services/authManager', () => ({ getValidToken: vi.fn(), refreshToken: vi.fn(), forceLogout: vi.fn() }))
vi.mock('@/services/env', () => ({ isTauri: false, getApiBase: () => '/api' }))

import { getValidToken } from '@/services/authManager'
import { CancelAllTools } from './CancelAllTools'

const jwt = (subject: string) => `header.${btoa(JSON.stringify({ sub: subject }))}.signature`
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Stop all tools in this session' }))
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Send interruption to all tools' }))

function mount() {
  const store = createStore()
  store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' })
  store.set(authModeConfirmedAtom, true)
  return { ...render(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>), store }
}

describe('cancel all tools authenticated preflight', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('sends no POST when an awaited cookie refresh returns B while the current user still says A', async () => {
    let resolve!: (token: string) => void
    vi.mocked(getValidToken).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mount()
    open(); confirm()
    await act(() => resolve(jwt('user-b')))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([null, 'malformed-token', jwt('user-b')])('rejects an unverifiable Bearer without sending a POST', async (token) => {
    vi.mocked(getValidToken).mockResolvedValueOnce(token)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mount()
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send when the provider auth mode was not confirmed', async () => {
    vi.mocked(getValidToken).mockResolvedValueOnce(jwt('user-a'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { store } = mount()
    act(() => store.set(authModeConfirmedAtom, false))
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No request was sent'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['unavailable', 'another session', 'another account', 'A-B-A'])('sends no POST if %s happens while awaiting the token', async (change) => {
    let resolve!: (token: string) => void
    vi.mocked(getValidToken).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { rerender, store } = mount()
    open(); confirm()
    if (change === 'unavailable') rerender(<Provider store={store}><CancelAllTools sessionId="s1" available={false} /></Provider>)
    if (change === 'another session') rerender(<Provider store={store}><CancelAllTools sessionId="s2" available /></Provider>)
    if (change === 'another account' || change === 'A-B-A') {
      act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
      if (change === 'A-B-A') act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    }
    await act(() => resolve(jwt('user-a')))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the verified A Bearer exactly once when the identity stays stable', async () => {
    vi.mocked(getValidToken).mockResolvedValueOnce(jwt('user-a'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ capped: false, killed_pids: [], cli_pid: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mount()
    open(); confirm()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${jwt('user-a')}`)
  })
})
