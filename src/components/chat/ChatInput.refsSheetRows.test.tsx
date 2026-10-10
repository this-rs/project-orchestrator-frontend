/**
 * The `#` / `@` picker as the phone shows it, keyboard up: the screen width comes from a
 * mocked `matchMedia` (the real `useIsMobile`), the visible area from a mocked
 * `visualViewport`. jsdom computes no layout, so "rows that fit" is the arithmetic of
 * the sheet's max-height against the 44px rows and the header it pays for; the
 * pixels themselves were checked in a browser.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.refsSheetRows.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatServerFeaturesAtom } from '@/atoms'
import type { RefSearchItem } from '@/refs/refsApi'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import { ChatInput } from './ChatInput'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))
vi.mock('@/refs/refsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/refs/refsApi')>()
  return { ...actual, refsApi: { search: searchMock } }
})

const ROW = 44
/** Grab handle + the one-line header (query, kind chips, close). */
const HEADER = 52

const KINDS = ['task', 'plan', 'note']
const items: RefSearchItem[] = Array.from({ length: 20 }, (_, i) => ({
  kind: KINDS[i % KINDS.length],
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  label: `Item ${i + 1}`,
  project: { id: '00000000-0000-4000-8000-000000000999', slug: 'demo', name: 'Demo' },
}))

class FakeVisualViewport extends EventTarget {
  height = 500
  offsetTop = 0
}

let wide = false
const realMatchMedia = window.matchMedia
const realRect = HTMLElement.prototype.getBoundingClientRect

function phone({ visible, composerTop }: { visible: number; composerTop: number }) {
  const vv = new FakeVisualViewport()
  vv.height = visible
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: visible, configurable: true, writable: true })
  // Every box sits where the composer sits: only the composer's top matters to the sheet.
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ top: composerTop, bottom: composerTop + 110, left: 0, right: 390, width: 390, height: 110, x: 0, y: composerTop, toJSON: () => ({}) }) as DOMRect
}

function mount() {
  const store = createStore()
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  const onSend = vi.fn()
  render(
    <Provider store={store}>
      <ChatInput onSend={onSend} onQueue={vi.fn()} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
  return { onSend }
}
const box = () => screen.getByRole('combobox') as HTMLTextAreaElement
const type = (text: string) => {
  const ta = box()
  ta.focus()
  fireEvent.change(ta, { target: { value: text } })
  ta.setSelectionRange(text.length, text.length)
  fireEvent.select(ta)
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(160) })
const rowsThatFit = () => Math.floor((parseFloat(screen.getByTestId('ref-picker').style.maxHeight) - HEADER) / ROW)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
  localStorage.clear()
  wide = false
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.matchMedia = realMatchMedia
  HTMLElement.prototype.getBoundingClientRect = realRect
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
})

describe('ChatInput - the reference sheet on a phone, keyboard open', () => {
  it('has room for at least six 44px rows in a 390x500 visible area (it used to fit about three)', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('#')
    await settle()
    expect(screen.getByTestId('ref-picker').dataset.variant).toBe('sheet')
    expect(screen.getAllByTestId('ref-option')).toHaveLength(items.length)
    expect(rowsThatFit()).toBeGreaterThanOrEqual(6)
    // ...and it never climbs above the visible area.
    expect(parseFloat(screen.getByTestId('ref-picker').style.maxHeight)).toBeLessThanOrEqual(391 - 8)
  })

  it('still shows five rows when only 400px are visible', async () => {
    phone({ visible: 400, composerTop: 291 })
    mount()
    type('@')
    await settle()
    expect(rowsThatFit()).toBeGreaterThanOrEqual(5)
  })

  it('every row is a 44px touch target with the title and a second line (kind, project), truncated', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('#')
    await settle()
    const row = screen.getAllByTestId('ref-option')[0]
    expect(row.className).toMatch(/\bmin-h-11\b/)
    expect(row.textContent).toContain('Item 1')
    expect(row.textContent).toContain('Task · Demo')
    expect(row.querySelectorAll('.truncate').length).toBeGreaterThanOrEqual(2)
  })

  it('echoes the query at the top of the sheet', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('see #plan')
    await settle()
    expect(screen.getByTestId('ref-picker-query').textContent).toBe('#plan')
  })

  it('a tap on a row inserts the reference chip and keeps the focus in the composer', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('see #')
    await settle()
    fireEvent.click(screen.getAllByTestId('ref-option')[1])
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(box().value).toContain(`#plan:${items[1].id}`)
    const chips = screen.getByRole('list', { name: /references/i })
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1)
    expect(document.activeElement).toBe(box())
  })

  it('a kind chip narrows the search to that kind, "All" widens it again, the focus never moves', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('#it')
    await settle()
    const group = screen.getByRole('group', { name: /filter by kind/i })
    const task = within(group).getByRole('button', { name: /task/i })
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    task.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    fireEvent.click(task)
    await settle()
    expect(task.getAttribute('aria-pressed')).toBe('true')
    // The stand-in server answers whatever is asked: what matters is what was asked.
    expect(searchMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'it', kinds: ['task'] }), expect.anything())
    fireEvent.click(within(group).getByRole('button', { name: 'All' }))
    await settle()
    // Every kind again (the first answer, from the cache).
    expect(new Set(screen.getAllByTestId('ref-option').map((o) => o.dataset.kind)).size).toBe(KINDS.length)
    expect(within(group).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(box())
  })

  it('no chips when a kind prefix is typed: the text already chose', async () => {
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('#task it')
    await settle()
    expect(screen.queryByRole('group', { name: /filter by kind/i })).toBeNull()
    expect(screen.getByTestId('ref-picker').textContent).toContain('Task only')
  })

  it('an empty answer is said in the list, not as a murmur in a corner', async () => {
    searchMock.mockResolvedValue([])
    phone({ visible: 500, composerTop: 391 })
    mount()
    type('#zz')
    await settle()
    expect(screen.queryByRole('listbox')).toBeNull()
    const status = screen.getByTestId('ref-picker-status')
    expect(status.textContent).toBe('No results')
    expect(status.closest('.sr-only')).toBeNull()
  })
})

describe('ChatInput - the reference popover on a wide screen is unchanged', () => {
  it('is the popover, without chips, and the arrows, Enter and Escape drive it', async () => {
    wide = true
    mount()
    type('see #')
    await settle()
    const picker = screen.getByTestId('ref-picker')
    expect(picker.dataset.variant).toBe('popover')
    expect(screen.queryByRole('group', { name: /filter by kind/i })).toBeNull()
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    const active = box().getAttribute('aria-activedescendant')
    expect(active).toBe(screen.getAllByRole('option')[2].id)
    expect(screen.getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(box().value).toContain(`#note:${items[2].id}`)
    type(`${box().value}#x`)
    await settle()
    expect(screen.getByTestId('ref-picker')).toBeTruthy()
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(document.activeElement).toBe(box())
  })
})
