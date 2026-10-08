/**
 * Findings of the adversarial review of the `#` composer: Enter and Tab (B1),
 * arrows on an empty picker (B6), refocus (B7), no empty listbox (B8), the
 * 21st reference (S1), and a composer without refs_v1 that stays what it was.
 *
 * Run with: npx vitest run src/refs/__tests__/review/composerReview.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import search from '@/refs/__fixtures__/search_response.json'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import { ChatInput } from '@/components/chat/ChatInput'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))
vi.mock('@/refs/refsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/refs/refsApi')>()
  return { ...actual, refsApi: { search: searchMock } }
})

import { parseSearchResponse } from '@/refs/refsApi'
const items = parseSearchResponse(search.response)
const [planItem] = items
const planToken = `#plan:${planItem.id}`

type Store = ReturnType<typeof createStore>
let store: Store
let onSend: ReturnType<typeof vi.fn>
let onQueue: ReturnType<typeof vi.fn>

function mount(opts: { features?: string[]; streaming?: boolean } = {}) {
  if (opts.features) store.set(chatServerFeaturesAtom, opts.features)
  return render(
    <Provider store={store}>
      <ChatInput onSend={onSend} onQueue={onQueue} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={opts.streaming ?? false} sessionId="s1" />
    </Provider>,
  )
}

const box = () => screen.getByRole(screen.queryByRole('combobox') ? 'combobox' : 'textbox') as HTMLTextAreaElement
const type = (text: string, caret = text.length) => {
  const ta = box()
  fireEvent.change(ta, { target: { value: text } })
  ta.setSelectionRange(caret, caret)
  fireEvent.select(ta)
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(160) })
const key = (k: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(box(), { key: k, ...init })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  store = createStore()
  onSend = vi.fn()
  onQueue = vi.fn()
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

const arrow = (k: 'ArrowUp' | 'ArrowDown') => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  box().dispatchEvent(ev)
  return ev
}

describe('B1 - Enter and Tab take a result only when one is really active', () => {
  it('"closes #42" is sent, not swallowed by a ref', async () => {
    mount({ features: ['refs_v1'] })
    type('closes #42')
    await settle()
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toBe('closes #42')
    expect(onSend.mock.calls[0][2]).toBeUndefined()
  })
  it('Tab on "#42" keeps its meaning (nothing is picked)', async () => {
    mount({ features: ['refs_v1'] })
    type('closes #42')
    await settle()
    key('Tab')
    expect(box().value).toBe('closes #42')
  })
  it('the search failing: Enter sends the message', async () => {
    searchMock.mockRejectedValue(new Error('offline'))
    mount({ features: ['refs_v1'] })
    type('see #re')
    await settle()
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('still loading: Enter sends the message', () => {
    mount({ features: ['refs_v1'] })
    type('see #re')
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('an empty list: Enter sends the message', async () => {
    searchMock.mockResolvedValue([])
    mount({ features: ['refs_v1'] })
    type('see #zzz')
    await settle()
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('a real search with an active result: Enter picks it and does not send', async () => {
    mount({ features: ['refs_v1'] })
    type('see #re')
    await settle()
    expect(box().getAttribute('aria-activedescendant')).toBeTruthy()
    key('Enter')
    expect(onSend).not.toHaveBeenCalled()
    expect(box().value).toContain(planToken)
  })
  it('Escape closes the picker, then Enter sends', async () => {
    mount({ features: ['refs_v1'] })
    type('see #re')
    await settle()
    key('Escape')
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
  })
  it('IME, Safari order: compositionend then Enter keyCode 229 neither picks nor sends', async () => {
    mount({ features: ['refs_v1'] })
    type('#')
    await settle()
    fireEvent.compositionStart(box())
    fireEvent.compositionEnd(box())
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
    expect(box().value).toBe('#')
  })
})

describe('B6 - the arrows keep moving the caret when there is nothing to choose', () => {
  it('loading', () => {
    mount({ features: ['refs_v1'] })
    type('line1\nsee #r')
    expect(arrow('ArrowUp').defaultPrevented).toBe(false)
  })
  it('empty list', async () => {
    searchMock.mockResolvedValue([])
    mount({ features: ['refs_v1'] })
    type('line1\nsee #zzz')
    await settle()
    expect(arrow('ArrowUp').defaultPrevented).toBe(false)
    expect(arrow('ArrowDown').defaultPrevented).toBe(false)
  })
  it('with results they move the active option', async () => {
    mount({ features: ['refs_v1'] })
    type('see #re')
    await settle()
    expect(arrow('ArrowDown').defaultPrevented).toBe(true)
  })
})

describe('B7 - blur then refocus on the same #', () => {
  it('the picker comes back', async () => {
    mount({ features: ['refs_v1'] })
    type('#re')
    await settle()
    fireEvent.blur(box())
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    fireEvent.focus(box())
    expect(screen.queryByTestId('ref-picker')).not.toBeNull()
  })
})

describe('B8 - no listbox without an option', () => {
  it('no results: a status line, no listbox, a combobox that points at nothing', async () => {
    searchMock.mockResolvedValue([])
    mount({ features: ['refs_v1'] })
    type('#zzz')
    await settle()
    expect(screen.queryByRole('listbox')).toBeNull()
    const status = screen.getByTestId('ref-picker-status')
    expect(status.textContent).toBe('No results')
    expect(status.getAttribute('role')).toBe('status')
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(box().getAttribute('aria-controls')).toBeNull()
    expect(box().getAttribute('aria-activedescendant')).toBeNull()
  })
  it('with results: a listbox the combobox controls, and an active option that exists', async () => {
    mount({ features: ['refs_v1'] })
    type('#re')
    await settle()
    const list = screen.getByRole('listbox')
    expect(box().getAttribute('aria-expanded')).toBe('true')
    expect(box().getAttribute('aria-controls')).toBe(list.id)
    expect(document.getElementById(box().getAttribute('aria-activedescendant')!)).not.toBeNull()
  })
})

describe('S1 - the 21st reference is refused, said, and never sent', () => {
  const ids = Array.from({ length: 21 }, (_, i) => `57cf05c9-25b6-495d-ab07-de4b11d6${String(4000 + i)}`)
  const tok = (n: number) => ids.slice(0, n).map((i) => `#plan:${i}`).join(' ')

  it('typing the 21st token leaves the text as it was and announces why', () => {
    mount({ features: ['refs_v1'] })
    type(tok(20))
    type(tok(21))
    expect(box().value).toBe(tok(20))
    const notice = screen.getByTestId('refs-limit-notice')
    expect(notice.textContent).toMatch(/Maximum 20 references/)
    expect(notice.getAttribute('role')).toBe('status')
    key('Enter')
    expect(onSend.mock.calls[0][2]).toHaveLength(20)
    expect(onSend.mock.calls[0][0]).toBe(tok(20))
  })
  it('the notice goes away at the next accepted change', () => {
    mount({ features: ['refs_v1'] })
    type(tok(20))
    type(tok(21))
    type(tok(20) + ' ok')
    expect(screen.getByTestId('refs-limit-notice').textContent).toBe('')
  })
  it('a restored draft over the limit is not sent', () => {
    store.set(chatDraftInputAtom, tok(21))
    mount({ features: ['refs_v1'] })
    key('Enter')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByTestId('refs-limit-notice').textContent).toMatch(/Maximum 20/)
  })
})

describe('without refs_v1 the composer is what it was', () => {
  it('a plain textbox: no combobox, no notice, no picker, Enter sends', async () => {
    mount()
    expect(screen.queryByRole('combobox')).toBeNull()
    type('closes #42 #re')
    await settle()
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(screen.queryByTestId('refs-limit-notice')).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
    key('Enter')
    expect(onSend).toHaveBeenCalledWith('closes #42 #re', [])
  })
  it('21 tokens are text like any other', () => {
    mount()
    const many = Array.from({ length: 21 }, (_, i) => `#plan:57cf05c9-25b6-495d-ab07-de4b11d6${4000 + i}`).join(' ')
    type(many)
    expect(box().value).toBe(many)
    key('Enter')
    expect(onSend).toHaveBeenCalledWith(many, [])
  })
})
