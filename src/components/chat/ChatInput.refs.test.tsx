/**
 * The `#` composer: trigger, ARIA combobox, keyboard, IME guard, chips, send.
 * Search answers are the backend's golden fixture. Everything is off unless
 * the server announced refs_v1.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.refs.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import search from '@/refs/__fixtures__/search_response.json'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import { ChatInput } from './ChatInput'

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
const [planItem, taskItem] = items
const planToken = `#plan:${planItem.id}`
const taskToken = `#task:${taskItem.id}`

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

describe('ChatInput — # references off (no refs_v1)', () => {
  it('is the composer it always was: plain textbox, no combobox, # opens nothing, nothing is searched', async () => {
    mount()
    expect(screen.queryByRole('combobox')).toBeNull()
    type('#')
    await settle()
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
    type(`voir ${planToken}`)
    expect(screen.queryByTestId('reference-chip')).toBeNull()
    key('Enter')
    expect(onSend).toHaveBeenCalledWith(`voir ${planToken}`, [])
    expect(onSend.mock.calls[0]).toHaveLength(2)
  })
})

describe('ChatInput — # references on', () => {
  it('is an ARIA combobox that is collapsed until a # is typed', () => {
    mount({ features: ['refs_v1'] })
    const ta = box()
    expect(ta.getAttribute('role')).toBe('combobox')
    expect(ta.getAttribute('aria-expanded')).toBe('false')
    expect(ta.getAttribute('aria-haspopup')).toBe('listbox')
    expect(ta.getAttribute('aria-autocomplete')).toBe('list')
    expect(ta.hasAttribute('aria-controls')).toBe(false)
  })

  it('opens on #, searches after 150 ms, and exposes a listbox wired to the combobox', async () => {
    mount({ features: ['refs_v1'] })
    type('voir #ref')
    expect(screen.getByTestId('ref-picker')).toBeTruthy()
    expect(searchMock).not.toHaveBeenCalled()
    await settle()
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock.mock.calls[0][0]).toMatchObject({ q: 'ref' })
    const ta = box()
    const list = screen.getByRole('listbox', { name: 'References' })
    expect(ta.getAttribute('aria-expanded')).toBe('true')
    expect(ta.getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(ta.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(options[1].getAttribute('aria-selected')).toBe('false')
    // each option says its kind in words
    expect(options[0].textContent).toContain('Plan')
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('3 results')
  })

  it('moves the active option with the arrows (wrapping) without leaving the textarea', async () => {
    mount({ features: ['refs_v1'] })
    type('#')
    await settle()
    const ids = () => box().getAttribute('aria-activedescendant')
    const opts = screen.getAllByRole('option')
    key('ArrowDown')
    expect(ids()).toBe(opts[1].id)
    key('ArrowUp')
    key('ArrowUp')
    expect(ids()).toBe(opts[2].id)
    key('ArrowDown')
    expect(ids()).toBe(opts[0].id)
    expect(document.activeElement).toBe(box())
  })

  it('Enter picks the active option: the token replaces the typed query, a chip appears, the picker closes', async () => {
    mount({ features: ['refs_v1'] })
    type('voir #ref')
    await settle()
    key('ArrowDown')
    key('Enter')
    expect(store.get(chatDraftInputAtom)).toBe(`voir ${taskToken} `)
    expect(box().value).toBe(`voir ${taskToken} `)
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    const chips = screen.getAllByTestId('reference-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toContain('PR 1 — backend : fondations refs')
    expect(chips[0].dataset.state).toBe('ok')
    expect(screen.getByRole('list', { name: 'References' })).toBeTruthy()
  })

  it('a click on an option picks it, and the focus stays in the textarea', async () => {
    mount({ features: ['refs_v1'] })
    box().focus()
    type('#')
    await settle()
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(store.get(chatDraftInputAtom)).toBe(`${planToken} `)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(document.activeElement).toBe(box())
  })

  it('Tab also picks; Escape closes without touching the text and without sending, and Enter then sends', async () => {
    mount({ features: ['refs_v1'] })
    type('hello #ref')
    await settle()
    key('Escape')
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(box().value).toBe('hello #ref')
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(box())
    key('Enter')
    expect(onSend).toHaveBeenCalledWith('hello #ref', [])

    // a new trigger re-arms it, and Tab picks
    type('')
    type('#')
    await settle()
    key('Tab')
    expect(store.get(chatDraftInputAtom)).toBe(`${planToken} `)
  })

  it('Enter sends the message while the picker has nothing to pick (searching, then no result)', async () => {
    searchMock.mockResolvedValue([])
    mount({ features: ['refs_v1'] })
    type('half typed #zzz')
    expect(screen.getByTestId('ref-picker')).toBeTruthy()
    key('Enter') // still searching: no active option
    expect(onSend).toHaveBeenCalledTimes(1)
    type('half typed #zzz')
    await settle()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('No results')
    key('Enter') // no result
    expect(onSend).toHaveBeenCalledTimes(2)
  })

  it('does nothing while an IME composition is running, and picks up again when it ends', async () => {
    mount({ features: ['refs_v1'] })
    const ta = box()
    fireEvent.compositionStart(ta)
    type('#に')
    await settle()
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
    // Enter confirms a candidate: it must not send
    fireEvent.keyDown(ta, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.compositionEnd(ta)
    await settle()
    expect(screen.getByTestId('ref-picker')).toBeTruthy()
    expect(searchMock.mock.calls[0][0]).toMatchObject({ q: 'に' })
  })

  it('does not open in a heading, a code span or glued to a word', async () => {
    mount({ features: ['refs_v1'] })
    for (const text of ['# title', '`#x', 'abc#x']) {
      type(text)
      await settle()
      expect(screen.queryByTestId('ref-picker'), text).toBeNull()
    }
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('narrows to a kind with a prefix: "#rfc design"', async () => {
    mount({ features: ['refs_v1'] })
    type('#rfc design')
    await settle()
    expect(searchMock.mock.calls[0][0]).toMatchObject({ q: 'design', kinds: ['rfc'] })
    expect(screen.getByTestId('ref-picker').textContent).toContain('RFC only')
  })

  it('shows a search failure in words', async () => {
    searchMock.mockRejectedValue(new Error('network down'))
    mount({ features: ['refs_v1'] })
    type('#a')
    await settle()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('The search is unavailable right now. Try again.')
  })

  it('a token goes as one piece: Backspace right after it removes all of it', async () => {
    mount({ features: ['refs_v1'] })
    type(`a ${planToken}`)
    key('Backspace')
    expect(store.get(chatDraftInputAtom)).toBe('a ')
    expect(screen.queryByTestId('reference-chip')).toBeNull()
  })

  it('the chip\'s remove button deletes its token and gives the focus back to the text', async () => {
    mount({ features: ['refs_v1'] })
    type(`a ${planToken} b ${taskToken}`)
    expect(screen.getAllByTestId('reference-chip')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Remove Plan/ }))
    expect(store.get(chatDraftInputAtom)).toBe(`a b ${taskToken}`)
    expect(screen.getAllByTestId('reference-chip')).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(document.activeElement).toBe(box())
  })

  it('# → chip → send: onSend gets the text with its token and the reference (kind, id, label)', async () => {
    mount({ features: ['refs_v1'] })
    type('regarde #ref')
    await settle()
    key('Enter')
    type(`${box().value}merci`)
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
    const [text, ids, refs] = onSend.mock.calls[0]
    expect(text).toBe(`regarde ${planToken} merci`)
    expect(ids).toEqual([])
    expect(refs).toEqual([expect.objectContaining({ kind: 'plan', id: planItem.id, label: planItem.label })])
    // the composer starts clean
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(screen.queryByTestId('reference-chip')).toBeNull()
  })

  it('sends a typed or restored token as a reference too (the text is the source of truth), unlabeled', () => {
    store.set(chatDraftInputAtom, `ancien brouillon ${taskToken}`)
    mount({ features: ['refs_v1'] })
    expect(screen.getByTestId('reference-chip').textContent).toContain('Task 3adeffc9')
    key('Enter')
    expect(onSend.mock.calls[0][2]).toEqual([{ kind: 'task', id: taskItem.id }])
  })

  it('queues the references with the message when a response is running', () => {
    mount({ features: ['refs_v1'], streaming: true })
    type(`après ${planToken}`)
    key('Enter')
    expect(onSend).not.toHaveBeenCalled()
    expect(onQueue.mock.calls[0][0]).toBe(`après ${planToken}`)
    expect(onQueue.mock.calls[0][2]).toEqual([{ kind: 'plan', id: planItem.id }])
  })

  it('refuses a 21st reference and says so', async () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `#note:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(' ')
    mount({ features: ['refs_v1'] })
    type(`${tokens} #`)
    await settle()
    expect(screen.getByTestId('ref-picker').textContent).toContain('maximum references reached')
    key('Enter')
    expect(store.get(chatDraftInputAtom)).toBe(`${tokens} #`)
  })
})
