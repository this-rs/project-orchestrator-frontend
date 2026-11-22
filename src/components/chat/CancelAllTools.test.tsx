import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ApiError } from '@/services/api'
import { authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'

vi.mock('@/services/chat', () => ({ chatApi: { cancelTools: vi.fn() } }))
import { chatApi } from '@/services/chat'
import { CancelAllTools } from './CancelAllTools'

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Stop all tools in this session' }))
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Send interruption to all tools' }))
const refusal = (status: number, code: string, retryable: boolean) =>
  new ApiError(status, JSON.stringify({ code, retryable }))

function mount(sessionId = 's1') {
  const store = createStore()
  store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' })
  store.set(authModeConfirmedAtom, true)
  const view = render(<Provider store={store}><CancelAllTools sessionId={sessionId} available /></Provider>)
  return { ...view, store }
}

describe('session-wide cancellation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('asks for confirmation, describes the actual scope, then sends once for this session', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    mount()
    open()
    expect(screen.getByText(/all tool processes in this session, while the turn continues/)).toHaveTextContent('may ignore the signal or survive')
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Send interruption to all tools' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    expect(chatApi.cancelTools).toHaveBeenCalledWith('s1', expect.any(Function), expect.any(AbortSignal))
    await act(() => resolve({ capped: false, killed_pids: [123], cli_pid: null }))
    expect(screen.getByRole('status')).toHaveTextContent('does not guarantee processes stopped')
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
  })

  it.each([
    ['504 timeout', refusal(504, 'owner_timeout', true)],
    ['409 missing owner', refusal(409, 'owner_unreachable', false)],
    ['410 session gone', refusal(410, 'session_gone', true)],
    ['network failure', new TypeError('Failed to fetch')],
  ])('%s is uncertain and never invites or causes an automatic retry', async (_name, failure) => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(failure)
    mount()
    open()
    confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('outcome is unknown'))
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('shows a refusal without retry and a rate cap only when the server confirms no signal', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: true, killed_pids: [], cli_pid: null })
    mount()
    open()
    confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No signal sent'))
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
  })

  it('a provider refusal remains visible and never repeats the request', async () => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(refusal(422, 'unsupported', false))
    mount()
    open()
    confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('provider refused'))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('requires a person to acknowledge verification and confirm again for a new request', async () => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(refusal(504, 'owner_timeout', false))
    mount()
    open()
    confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('outcome is unknown'))
    fireEvent.click(screen.getByRole('button', { name: 'I checked this session — allow another request' }))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    open()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('two mounted controls cannot both send the same confirmation', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const store = createStore()
    render(<Provider store={store}><CancelAllTools sessionId="s1" available /><CancelAllTools sessionId="s1" available /></Provider>)
    for (const button of screen.getAllByRole('button', { name: 'Stop all tools in this session' })) fireEvent.click(button)
    const buttons = screen.getAllByRole('button', { name: 'Send interruption to all tools' })
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    await act(() => resolve({ capped: false, killed_pids: [1], cli_pid: null }))
  })

  it('invalidates the other open confirmation when an operation ends and is reset', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [1], cli_pid: null })
    const store = createStore()
    render(<Provider store={store}><CancelAllTools sessionId="s1" available /><CancelAllTools sessionId="s1" available /></Provider>)
    const [first, second] = screen.getAllByTestId('cancel-all-tools')
    fireEvent.click(within(first).getByRole('button', { name: 'Stop all tools in this session' }))
    fireEvent.click(within(second).getByRole('button', { name: 'Stop all tools in this session' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Send interruption to all tools' }))
    await waitFor(() => expect(within(first).getByRole('status')).toHaveTextContent('does not guarantee'))
    fireEvent.click(within(first).getByRole('button', { name: 'I checked this session — allow another request' }))
    expect(within(second).queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(within(second).getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('does not send a pending confirmation after availability was revoked', () => {
    const { rerender, store } = mount()
    open()
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available={false} /></Provider>)
    expect(screen.queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>)
    expect(screen.queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
  })

  it('does not carry a confirmation across sessions when navigation happens before sending', () => {
    const { rerender, store } = mount('s1')
    open()
    rerender(<Provider store={store}><CancelAllTools key="s2" sessionId="s2" available /></Provider>)
    expect(screen.queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
    rerender(<Provider store={store}><CancelAllTools key="s1" sessionId="s1" available /></Provider>)
    expect(screen.queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
  })

  it('keeps the outcome on the original session across navigation, never on another', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { rerender, store } = mount('s1')
    open()
    confirm()
    rerender(<Provider store={store}><CancelAllTools key="s2" sessionId="s2" available /></Provider>)
    await act(() => resolve({ capped: false, killed_pids: [1], cli_pid: null }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    rerender(<Provider store={store}><CancelAllTools key="s1" sessionId="s1" available /></Provider>)
    expect(screen.getByRole('status')).toHaveTextContent('does not guarantee processes stopped')
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('does not apply an old response to a new account store', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { rerender } = mount('s1')
    open()
    confirm()
    const otherAccount = createStore()
    rerender(<Provider store={otherAccount}><CancelAllTools key="other" sessionId="s1" available /></Provider>)
    await act(() => resolve({ capped: false, killed_pids: [1], cli_pid: null }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('does not show a late response from A to B in the same store, even for the same session', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { store } = mount('s1')
    open()
    confirm()
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    await act(() => resolve({ capped: false, killed_pids: [1], cli_pid: null }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
  })

  it('does not resurrect a confirmation or old outcome after A → B → A', async () => {
    let resolve!: (v: { capped: boolean; killed_pids: number[]; cli_pid: null }) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { store } = mount('s1')
    open()
    confirm()
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    await act(() => resolve({ capped: false, killed_pids: [1], cli_pid: null }))
    expect(screen.getByRole('status')).toHaveTextContent('does not guarantee processes stopped')
    expect(screen.queryByRole('button', { name: 'Send interruption to all tools' })).toBeNull()
    expect(screen.getByRole('button', { name: 'I checked this session — allow another request' })).toBeEnabled()
  })

  it('keeps an earlier A request pending or uncertain after A → B → A, without blocking B', async () => {
    let reject!: (reason: Error) => void
    vi.mocked(chatApi.cancelTools).mockReturnValueOnce(new Promise((_resolve, r) => { reject = r }))
    const { store } = mount('s1')
    open(); confirm()
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sending interruption')
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    await act(() => reject(new TypeError('connection lost')))
    expect(screen.getByRole('status')).toHaveTextContent('outcome is unknown')
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })
})
