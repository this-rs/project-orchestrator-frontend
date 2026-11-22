import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ApiError } from '@/services/api'
import { chatSessionIdAtom } from '@/atoms'
import { authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'
import { tabbables } from '@/hooks/useModalFocus'

vi.mock('@/services/chat', () => ({ chatApi: { cancelTools: vi.fn(), cancelTask: vi.fn() } }))
import { chatApi } from '@/services/chat'
import { CancelAllTools } from './CancelAllTools'
import type { RunningItem } from './runningActivity'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const ITEMS: RunningItem[] = [
  { id: 'a1', kind: 'agent', title: 'Sub-agent recent', startedAt: minutesAgo(3) },
  { id: 'a2', kind: 'workflow', title: 'Workflow old', startedAt: minutesAgo(50) },
  { id: 'b1', kind: 'shell', title: 'Build old', startedAt: minutesAgo(30), taskId: 'tb1' },
  { id: 'b2', kind: 'shell', title: 'Build recent', startedAt: minutesAgo(2), taskId: 'tb2' },
  { id: 'm1', kind: 'monitor', title: 'Monitor old', startedAt: minutesAgo(45), taskId: 'tm1' },
  { id: 'm2', kind: 'monitor', title: 'Monitor recent', startedAt: minutesAgo(1), taskId: 'tm2' },
  { id: 'r1', kind: 'run', title: 'Run old', startedAt: minutesAgo(20), sessionId: 'child' },
]
const TRIGGER = 'Stop session tools, including sub-agent tools'
const ok = (taskId: string) => ({ task_id: taskId, killed_pids: [1], capped: false })

function mount(items: RunningItem[] = ITEMS) {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  store.set(currentUserAtom, { id: 'user-a', email: 'a@example.com', name: 'A' })
  store.set(authModeConfirmedAtom, true)
  const view = render(<Provider store={store}><CancelAllTools sessionId="s1" available items={items} /></Provider>)
  return { ...view, store }
}
const trigger = () => screen.getByRole('button', { name: TRIGGER })
const openDialog = () => { trigger().focus(); fireEvent.click(trigger()); return screen.getByRole('dialog') }
const box = (title: string) => screen.getByRole('checkbox', { name: new RegExp(title) }) as HTMLInputElement
const ticked = () => screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).map((c) => c.closest('label')!.textContent!.replace(/for .*$/, '').replace(/age unknown$/, ''))
const quick = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const primary = (name: RegExp) => screen.getByRole('button', { name })
const noRequest = () => { expect(chatApi.cancelTools).not.toHaveBeenCalled(); expect(chatApi.cancelTask).not.toHaveBeenCalled() }

describe('stop tools dialog', () => {
  beforeEach(() => vi.resetAllMocks())

  it('the click opens a labelled dialog and sends nothing', () => {
    mount()
    const dialog = openDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Stop this session’s tools')
    expect(dialog).toHaveAccessibleDescription(/Nothing is sent until you confirm/)
    noRequest()
  })

  it('lists every item, grouped by kind, with an age and everything ticked', () => {
    mount()
    openDialog()
    for (const group of ['Sub-agents', 'Background tasks', 'Monitors', 'Other']) expect(screen.getByRole('region', { name: group })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Monitors' })).getByText('for 45 min')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByText('7 of 7 selected')).toBeInTheDocument()
  })

  it('Escape sends nothing, closes, and gives focus back to the button', async () => {
    mount()
    openDialog()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    noRequest()
    expect(trigger()).toHaveFocus()
  })

  it('Cancel and a click outside the dialog send nothing', async () => {
    mount()
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    openDialog()
    fireEvent.click(screen.getByRole('dialog').firstElementChild!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    noRequest()
    expect(trigger()).toHaveFocus()
  })

  it('keeps Tab inside the dialog', () => {
    mount()
    const dialog = openDialog()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const all = tabbables(dialog)
    all[all.length - 1].focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(all[0])
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(all[all.length - 1])
  })

  it('everything ticked: one session-wide stop and no targeted one', async () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [1], cli_pid: null })
    mount()
    openDialog()
    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.click(primary(/^Stop 7 items$/))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
    expect(chatApi.cancelTask).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('does not guarantee'))
  })

  it('a partial selection sends exactly one targeted stop per ticked row, never the global one, and says foreground tools stay', async () => {
    vi.mocked(chatApi.cancelTask).mockImplementation(async (_s, id) => ok(id))
    mount()
    openDialog()
    fireEvent.click(box('Build recent'))
    fireEvent.click(box('Monitor recent'))
    expect(screen.getByRole('note')).toHaveTextContent('Tools running in the foreground are not stopped')
    // Sub-agents and the run have no task id: they are named as kept, and not counted.
    expect(screen.getByRole('note')).toHaveTextContent('cannot be stopped one by one (sub-agents, runs): 3')
    fireEvent.click(primary(/^Stop 2 items$/))
    await waitFor(() => expect(chatApi.cancelTask).toHaveBeenCalledTimes(2))
    expect(vi.mocked(chatApi.cancelTask).mock.calls.map((c) => c[1]).sort()).toEqual(['tb1', 'tm1'])
    expect(chatApi.cancelTools).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2))
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Signal accepted for 1 process')
  })

  it('does not stop anything when only untargetable rows are ticked', () => {
    mount()
    openDialog()
    quick('None')
    fireEvent.click(box('Sub-agent recent'))
    expect(primary(/^Stop 0 items$/)).toBeDisabled()
    noRequest()
  })

  it('quick selections untick the right subset', () => {
    mount()
    openDialog()
    quick('Only the old ones')
    expect(ticked().sort()).toEqual(['Build old', 'Monitor old', 'Run old', 'Workflow old'])
    quick('All'); quick('Keep background tasks')
    expect(ticked()).not.toContain('Build old'); expect(ticked()).not.toContain('Build recent'); expect(ticked()).toHaveLength(5)
    quick('All'); quick('Keep monitors')
    expect(ticked().filter((t) => t.startsWith('Monitor'))).toEqual([]); expect(ticked()).toHaveLength(5)
    quick('All'); quick('Keep sub-agents')
    expect(ticked().filter((t) => /Sub-agent|Workflow/.test(t))).toEqual([]); expect(ticked()).toHaveLength(5)
    quick('None')
    expect(ticked()).toEqual([])
    expect(screen.getByText('0 of 7 selected')).toBeInTheDocument()
    quick('All')
    expect(screen.getByText('7 of 7 selected')).toBeInTheDocument()
  })

  it('shows each answer per item: unreachable owner is never "already stopped"', async () => {
    vi.mocked(chatApi.cancelTask).mockImplementation(async (_s, id) => {
      if (id === 'tb1') throw new ApiError(409, JSON.stringify({ code: 'owner_unreachable', retryable: true }))
      if (id === 'tm1') throw new ApiError(403, 'no')
      return ok(id)
    })
    mount()
    openDialog()
    quick('Only the old ones')
    fireEvent.click(box('Run old')); fireEvent.click(box('Workflow old'))
    fireEvent.click(primary(/^Stop 2 items$/))
    const list = await screen.findByRole('list', { name: 'Results per item' })
    await waitFor(() => expect(within(list).getAllByRole('status')).toHaveLength(2))
    expect(list).toHaveTextContent('Build old: Owner unreachable; no stop was confirmed')
    expect(list).toHaveTextContent('Monitor old: Authorization refused (403)')
    expect(list.textContent).not.toMatch(/already stopped/i)
    // A second confirmation cannot replay: the answer is on file until acknowledged.
    expect(chatApi.cancelTask).toHaveBeenCalledTimes(2)
  })

  it('bounds the number of stops in flight', async () => {
    let inFlight = 0; let max = 0
    const gates: Array<() => void> = []
    vi.mocked(chatApi.cancelTask).mockImplementation((_s, id) => {
      inFlight++; max = Math.max(max, inFlight)
      return new Promise((resolve) => gates.push(() => { inFlight--; resolve(ok(id)) }))
    })
    const many: RunningItem[] = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, kind: 'shell', title: `Shell ${i}`, startedAt: minutesAgo(30), taskId: `t${i}` }))
    mount([...many, { id: 'keep', kind: 'monitor', title: 'Keep me', startedAt: minutesAgo(30), taskId: 'tk' }])
    openDialog()
    quick('Keep monitors')
    fireEvent.click(primary(/^Stop 7 items$/))
    await waitFor(() => expect(gates).toHaveLength(4))
    expect(max).toBe(4)
    while (gates.length) { await act(async () => { gates.shift()!() }) }
    await waitFor(() => expect(chatApi.cancelTask).toHaveBeenCalledTimes(7))
    expect(max).toBe(4)
    expect(vi.mocked(chatApi.cancelTask).mock.calls.map((c) => c[1])).not.toContain('tk')
  })

  it('with nothing listed, offers only the session-wide stop', () => {
    vi.mocked(chatApi.cancelTools).mockResolvedValueOnce({ capped: false, killed_pids: [], cli_pid: null })
    mount([])
    openDialog()
    expect(screen.getByText(/No individual activity is listed/)).toBeInTheDocument()
    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send interruption to session and sub-agent tools' }))
    expect(chatApi.cancelTools).toHaveBeenCalledTimes(1)
  })
})
