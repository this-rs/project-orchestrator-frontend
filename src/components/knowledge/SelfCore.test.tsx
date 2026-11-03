/**
 * The declared core of the self: the prompt brought to the person, and the settings panel.
 *
 * Run with: npx vitest run src/components/knowledge/SelfCore.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'

const read = vi.fn()
const pin = vi.fn()
vi.mock('@/services/selfCore', () => ({
  selfCoreApi: {
    read: (...a: unknown[]) => read(...a),
    pin: (...a: unknown[]) => pin(...a),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import { currentUserAtom } from '@/atoms'
import { ApiError } from '@/services/api'
import type { SelfCore, SelfCoreNote } from '@/services/selfCore'
import { SelfCorePrompt } from './SelfCorePrompt'
import { SELF_CORE_LATER_KEY } from './selfCoreShared'
import { SelfCorePanel } from '@/components/settings/SelfCorePanel'
import { mountSettings } from '@/components/settings/settingsTestKit'

const note = (id: string, lands: boolean, chars = 420): SelfCoreNote => ({
  id,
  note_type: 'guideline',
  importance: 'critical',
  chars,
  entry: `- **[guideline|critical]** entry of ${id}\n`,
  lands,
})

const core = (over: Partial<SelfCore> = {}): SelfCore => ({
  scope: 'global',
  level: 4,
  budget_chars: 750,
  note_char_cap: 300,
  max_notes: 10,
  pinned: [],
  candidates: [note('n-first', true), note('n-second', true), note('n-third', false)],
  slots_used: 2,
  ...over,
})

function mountPrompt() {
  const store = createStore()
  store.set(currentUserAtom, { id: 'u', email: 'root@x', name: 'Root', is_root: true } as never)
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/today']}>
        <SelfCorePrompt />
      </MemoryRouter>
    </Provider>,
  )
}

const humanOnly = () =>
  new ApiError(403, JSON.stringify({ error: 'pinned_notes_human_only: only a signed-in person pins notes' }))

beforeEach(() => {
  // Reduced motion: the Dialog opens and closes without an animation to wait for.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  localStorage.clear()
  read.mockReset().mockResolvedValue(core())
  pin.mockReset().mockResolvedValue({ scope: 'global', note_ids: [] })
})
afterEach(() => {
  // The stub stays for the whole file: a closing Dialog may still read it after a test ends.
  document.body.style.overflow = ''
})
afterAll(() => vi.unstubAllGlobals())

describe('SelfCorePrompt', () => {
  it('appears when nothing is declared and candidates exist, with the budget and what lands, entries verbatim', async () => {
    mountPrompt()
    const prompt = await screen.findByTestId('self-core-prompt')
    expect(prompt.textContent).toContain('the foundation gets 750 characters')
    expect(prompt.textContent).toContain('cut at 300 characters')
    expect(prompt.textContent).toContain('2 of these 3 notes land')
    expect(prompt.textContent).toContain('- **[guideline|critical]** entry of n-first')
    expect(screen.getByTestId('self-core-pin')).toBeTruthy()
    expect(screen.getByTestId('self-core-later')).toBeTruthy()
    expect(screen.getByTestId('self-core-settings')).toBeTruthy()
    expect(read).toHaveBeenCalledWith()
    expect(pin).not.toHaveBeenCalled()
  })

  it('does not appear when something is already declared', async () => {
    read.mockResolvedValue(core({ pinned: [note('n-first', true)], candidates: [], slots_used: 1 }))
    mountPrompt()
    await waitFor(() => expect(read).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByTestId('self-core-prompt')).toBeNull()
  })

  it('does not appear when the fetch fails', async () => {
    read.mockRejectedValue(new ApiError(500, 'boom'))
    mountPrompt()
    await waitFor(() => expect(read).toHaveBeenCalled())
    expect(screen.queryByTestId('self-core-prompt')).toBeNull()
  })

  it('"Declare" sends the candidate ids in the order shown, then re-reads and closes', async () => {
    mountPrompt()
    fireEvent.click(await screen.findByTestId('self-core-pin'))
    await waitFor(() => expect(pin).toHaveBeenCalledWith(['n-first', 'n-second', 'n-third']))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('self-core-prompt')).toBeNull())
  })

  it('a note that does not fit is visibly marked as not landing', async () => {
    mountPrompt()
    await screen.findByTestId('self-core-prompt')
    const third = screen.getByTestId('self-core-entry-2')
    expect(third.getAttribute('data-lands')).toBe('false')
    expect(third.textContent).toContain('Does not land')
    expect(screen.getByTestId('self-core-entry-0').textContent).not.toContain('Does not land')
  })

  it('a 403 pinned_notes_human_only reads as the human-only sentence, and is not retried', async () => {
    pin.mockRejectedValue(humanOnly())
    mountPrompt()
    fireEvent.click(await screen.findByTestId('self-core-pin'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Only a signed-in person can declare this.')
    expect(pin).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('self-core-prompt')).toBeTruthy()
  })

  it('"Later" stores a three-day delay, and the prompt does not come back on a re-mount', async () => {
    const before = Date.now()
    const first = mountPrompt()
    fireEvent.click(await screen.findByTestId('self-core-later'))
    const until = Number(localStorage.getItem(SELF_CORE_LATER_KEY))
    expect(until).toBeGreaterThanOrEqual(before + 3 * 24 * 3600 * 1000)
    expect(pin).not.toHaveBeenCalled()
    first.unmount()
    read.mockClear()
    mountPrompt()
    await Promise.resolve()
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByTestId('self-core-prompt')).toBeNull()
  })
})

describe('SelfCorePanel', () => {
  it('shows the declared notes in order, their size, their line, and the budget from the server', async () => {
    read.mockResolvedValue(
      core({ level: 2, budget_chars: 1200, note_char_cap: 400, pinned: [note('a', true, 703), note('b', false)], candidates: [], slots_used: 1 }),
    )
    mountSettings(<SelfCorePanel />)
    const panel = await screen.findByTestId('self-core-panel')
    await within(panel).findByTestId('self-core-entry-1')
    expect(panel.textContent).toContain('At level L2, the foundation gets 1,200 characters')
    expect(panel.textContent).toContain('cut at 400 characters')
    expect(panel.textContent).toContain('703 characters written')
    expect(within(panel).getByTestId('self-core-entry-1').textContent).toContain('Does not land')
    expect(within(panel).queryByTestId('self-core-panel-pin')).toBeNull()
  })

  it('a proposal is declared as shown, re-read, and a 403 reads as human-only without a retry', async () => {
    mountSettings(<SelfCorePanel />)
    fireEvent.click(await screen.findByTestId('self-core-panel-pin'))
    await waitFor(() => expect(pin).toHaveBeenCalledWith(['n-first', 'n-second', 'n-third'], undefined))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))

    pin.mockReset().mockRejectedValue(humanOnly())
    fireEvent.click(await screen.findByTestId('self-core-panel-pin'))
    expect((await screen.findByRole('alert')).textContent).toBe('Only a signed-in person can declare this.')
    expect(pin).toHaveBeenCalledTimes(1)
  })

  it('more candidates than max_notes: the action is disabled, no request is sent', async () => {
    read.mockResolvedValue(core({ max_notes: 2 }))
    mountSettings(<SelfCorePanel />)
    const button = await screen.findByTestId('self-core-panel-pin')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(pin).not.toHaveBeenCalled()
    expect(screen.getByTestId('self-core-panel').textContent).toContain('At most 2 notes can be declared.')
  })
})
