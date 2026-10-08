/**
 * The `#` composer, seen by someone using it: the cap, the keyboard, the
 * announcements. Run with: npx vitest run src/components/chat/ChatInput.ChatInput.refsCap.test.tsx
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

let store: ReturnType<typeof createStore>

function mount() {
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
  fireEvent.change(ta, { target: { value: text } })
  ta.setSelectionRange(text.length, text.length)
  fireEvent.select(ta)
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(160) })
const key = (k: string) => fireEvent.keyDown(box(), { key: k })
const twenty = Array.from({ length: 20 }, (_, i) => `#note:00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(' ')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  store = createStore()
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('composer with 20 references', () => {
  it('bounds the chip area so the picker and the text stay on screen', () => {
    store.set(chatDraftInputAtom, twenty)
    mount()
    expect(screen.getAllByTestId('reference-chip')).toHaveLength(20)
    const list = screen.getByRole('list', { name: 'References' })
    expect(list.className).toMatch(/max-h-/)
    expect(list.className).toContain('overflow-y-auto')
  })

  it('the picker is bounded by the viewport too', async () => {
    mount()
    type('#')
    await settle()
    expect(screen.getByTestId('ref-picker').className).toMatch(/max-h-\[min\(/)
  })

  it('Enter on the 21st says why in the visible notice, and adds nothing', async () => {
    mount()
    type(`${twenty} #`)
    await settle()
    expect(screen.getByTestId('ref-picker-limit')).toBeTruthy()
    key('Enter')
    expect(store.get(chatDraftInputAtom)).toBe(`${twenty} #`)
    expect(screen.getByTestId('refs-limit-notice').textContent).toMatch(/maximum 20/i)
  })
})
