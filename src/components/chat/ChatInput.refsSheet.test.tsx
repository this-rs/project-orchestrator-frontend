/**
 * The `#` picker on a narrow screen (useIsMobile): a bottom sheet, the focus never leaves
 * the composer, Escape closes it. jsdom has no layout: placement/size are checked in the browser.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.refsSheet.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatServerFeaturesAtom } from '@/atoms'
import search from '@/refs/__fixtures__/search_response.json'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import { ChatInput } from './ChatInput'

const { searchMock, mobile } = vi.hoisted(() => ({ searchMock: vi.fn(), mobile: { on: true } }))
vi.mock('@/hooks', () => ({ useIsMobile: () => mobile.on }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))
vi.mock('@/refs/refsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/refs/refsApi')>()
  return { ...actual, refsApi: { search: searchMock } }
})

import { parseSearchResponse } from '@/refs/refsApi'
const items = parseSearchResponse(search.response)

function mount() {
  const store = createStore()
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  return render(
    <Provider store={store}>
      <ChatInput onSend={vi.fn()} onQueue={vi.fn()} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
  localStorage.clear()
  mobile.on = true
})
afterEach(() => vi.useRealTimers())

describe('ChatInput - # picker on a narrow screen', () => {
  it('opens as a bottom sheet, not a popover', async () => {
    mount()
    type('#')
    await settle()
    expect(screen.getByTestId('ref-picker').dataset.variant).toBe('sheet')
  })

  it('is still the popover on a wide screen', async () => {
    mobile.on = false
    mount()
    type('#')
    await settle()
    expect(screen.getByTestId('ref-picker').dataset.variant).toBe('popover')
  })

  it('keeps the focus in the composer while the sheet is open and after a pick', async () => {
    mount()
    type('#')
    await settle()
    expect(document.activeElement).toBe(box())
    expect(box().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getAllByTestId('ref-option')[0])
    expect(document.activeElement).toBe(box())
  })

  it('Escape closes the sheet and the focus stays in the composer', async () => {
    mount()
    type('#')
    await settle()
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(document.activeElement).toBe(box())
  })

  it('the close button closes it and gives the focus back to the composer', async () => {
    mount()
    type('#')
    await settle()
    screen.getByRole('button', { name: /close/i }).focus()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(document.activeElement).toBe(box())
  })
})
