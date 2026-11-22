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
    expect(screen.getByText(/all tool processes in this session/)).toHaveTextContent('Sub-agents’ tool processes can also be affected when they are descendants')
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
    ['502 relay failed', refusal(502, 'relay_failed', true)],
    ['502 owner failed', refusal(502, 'owner_failed', true)],
    ['502 owner protocol', refusal(502, 'owner_protocol', true)],
    ['410 session gone', refusal(410, 'session_gone', true)],
    ['422 untyped text proxy', new ApiError(422, 'proxy refused')],
    ['422 HTML proxy', new ApiError(422, '<html>proxy refused</html>')],
    ['422 different code', refusal(422, 'some_other_error', false)],
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

  it.each([
    [409, 'owner_unreachable', 'Owner unreachable; no stop was confirmed'],
    [401, 'unauthorized', 'authentication or authorization refusal'],
    [403, 'forbidden', 'authentication or authorization refusal'],
    [422, 'unsupported', 'refusal was received from an engine'],
  ])('HTTP %s is reported without a claim of success or an automatic retry', async (status, code, message) => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(refusal(status, code, true))
    const { rerender, store } = mount()
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available={false} /></Provider>)
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>)
    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403])('HTTP %s with an untyped proxy body remains unconfirmed and is not retried', async (status) => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(new ApiError(status, 'proxy refused'))
    mount()
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('outcome is unknown'))
    expect(screen.getByRole('status')).toHaveTextContent('authentication or authorization refusal')
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('a capped response may coexist with another owner acting; both controls wait for verification', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: true, killed_pids: [], cli_pid: null })
    const store = createStore()
    const { rerender } = render(<Provider store={store}><CancelAllTools sessionId="s1" available /><CancelAllTools sessionId="s1" available /></Provider>)
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop all tools in this session' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Send interruption to all tools' }))
    await waitFor(() => expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('rate limit'))).toBe(true))
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>)
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('retains capped uncertainty when the control becomes unavailable, including unsupported capability', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: true, killed_pids: [], cli_pid: null })
    const { rerender, store } = mount()
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Other owners may still act'))
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available={false} /></Provider>)
    expect(screen.getByRole('status')).toHaveTextContent('Other owners may still act')
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available={false} unsupported /></Provider>)
    expect(screen.getByRole('status')).toHaveTextContent('Other owners may still act')
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeDisabled()
    expect(screen.getByText('This provider cannot stop all tools in this session.')).toBeInTheDocument()
    rerender(<Provider store={store}><CancelAllTools sessionId="s1" available /></Provider>)
    expect(screen.getByRole('status')).toHaveTextContent('Other owners may still act')
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('a successful response from one owner does not claim that other owners finished', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [1], cli_pid: null })
    mount(); open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('other operations may still be in progress'))
    expect(screen.getByRole('status')).toHaveTextContent('response was received from one owner')
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })

  it('a provider refusal remains visible and never repeats the request', async () => {
    vi.mocked(chatApi.cancelTools).mockRejectedValueOnce(refusal(422, 'unsupported', false))
    mount()
    open()
    confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('refusal was received from an engine'))
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

  it('keeps a completed first-owner response across a later A → B → A until acknowledgement', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [1], cli_pid: null })
    const { store } = mount('s1')
    open(); confirm()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('other operations may still be in progress'))
    act(() => store.set(currentUserAtom, { id: 'user-b', email: 'b@example.com', name: 'B' }))
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    act(() => store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' }))
    expect(screen.queryByRole('button', { name: 'Stop all tools in this session' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('other operations may still be in progress')
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'I checked this session — allow another request' }))
    expect(screen.getByRole('button', { name: 'Stop all tools in this session' })).toBeEnabled()
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
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
