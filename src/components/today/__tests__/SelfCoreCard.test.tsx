/**
 * The self-core card of Today: the permanent surface that shows what the
 * foundation of every turn is — declared, or proposed by the ranking — and lets
 * whoever decides for everyone declare it.
 *
 * Run with: npx vitest run src/components/today/__tests__/SelfCoreCard.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import { currentUserAtom } from '@/atoms'
import type { SelfCore, SelfCoreNote } from '@/services/selfCore'
import { SelfCoreCard } from '../SelfCoreCard'
import { SELF_CORE_LATER_KEY } from '@/components/knowledge/selfCoreShared'

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

/** `canAnswer` mirrors `decidesForEveryoneAtom`: root (or the single user of a server without sign-in). */
function mountCard(canAnswer = false) {
  const store = createStore()
  if (canAnswer) store.set(currentUserAtom, { id: 'u', email: 'root@x', name: 'Root', is_root: true } as never)
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/today']}>
        <SelfCoreCard />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  read.mockReset().mockResolvedValue(core())
  pin.mockReset().mockResolvedValue({ scope: 'global', note_ids: [] })
})
afterEach(() => {
  document.body.style.overflow = ''
})
afterAll(() => vi.unstubAllGlobals())

describe('SelfCoreCard', () => {
  it('shows the proposed candidates, their verbatim entry lines, and the budget, when nothing is declared', async () => {
    mountCard()
    const card = await screen.findByTestId('self-core-card')
    expect(card.textContent).toContain('Proposal: nothing is declared yet')
    expect(card.textContent).toContain('the foundation gets 750 characters')
    expect(card.textContent).toContain('cut at 300 characters')
    expect(card.textContent).toContain('2 of these 3 notes land')
    expect(card.textContent).toContain('- **[guideline|critical]** entry of n-first')
    expect(card.textContent).toContain('- **[guideline|critical]** entry of n-third')
    expect(read).toHaveBeenCalledWith()
  })

  it('a note that does not fit is visibly marked as not landing', async () => {
    mountCard()
    // The card's shell (and its testid) exists while it is still loading: wait for the ENTRY, not the card.
    const third = await screen.findByTestId('self-core-entry-2')
    expect(third.getAttribute('data-lands')).toBe('false')
    expect(third.textContent).toContain('Does not land')
    expect(screen.getByTestId('self-core-entry-0').textContent).not.toContain('Does not land')
  })

  it('has no declare button for a reader who cannot answer, and says why', async () => {
    mountCard(false)
    const card = await screen.findByTestId('self-core-card')
    expect(screen.queryByTestId('self-core-card-pin')).toBeNull()
    expect(card.textContent).toContain('Only a signed-in person can declare this.')
  })

  it('shows the declare button for whoever decides for everyone', async () => {
    mountCard(true)
    await screen.findByTestId('self-core-card')
    expect(screen.getByTestId('self-core-card-pin')).toBeTruthy()
  })

  it('after declaring, re-reads and shows the declared state (no stale copy)', async () => {
    const declared = core({
      pinned: [note('n-first', true), note('n-second', true)],
      candidates: [],
      slots_used: 2,
    })
    read.mockResolvedValueOnce(core()).mockResolvedValueOnce(declared)
    mountCard(true)
    fireEvent.click(await screen.findByTestId('self-core-card-pin'))
    await waitFor(() => expect(pin).toHaveBeenCalledWith(['n-first', 'n-second', 'n-third']))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('self-core-card').textContent).toContain('Declared, in this order'))
    expect(screen.queryByTestId('self-core-card-pin')).toBeNull()
  })

  it('links to the settings panel, and mentions "later" only when the popup is deferred', async () => {
    const first = mountCard()
    await screen.findByTestId('self-core-card')
    const link = screen.getByTestId('self-core-card-settings')
    expect(link.getAttribute('href')).toContain('/providers#self-core')
    expect(screen.queryByText('You will be asked again in three days.')).toBeNull()

    first.unmount()
    localStorage.setItem(SELF_CORE_LATER_KEY, String(Date.now() + 3 * 24 * 3600 * 1000))
    mountCard()
    await screen.findByTestId('self-core-card')
    expect(screen.getByText('You will be asked again in three days.')).toBeTruthy()
  })
})
