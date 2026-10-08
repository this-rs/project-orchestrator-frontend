/**
 * The `#` composer, seen by someone using it: the cap, the keyboard, the
 * announcements. Run with: npx vitest run src/components/chat/ChatInput.ChatInput.refsAnnounce.test.tsx
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
const planToken = `#plan:${items[0].id}`

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  store = createStore()
  searchMock.mockReset()
  searchMock.mockResolvedValue(items)
  clearRefSearchCache()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('choosing a result is announced', () => {
  it('says "<title> added to the message." in a live region', async () => {
    mount()
    type('voir #ref')
    await settle()
    expect(screen.getByTestId('refs-pick-announcer').textContent).toBe('')
    key('Enter')
    const region = screen.getByTestId('refs-pick-announcer')
    expect(region.getAttribute('role')).toBe('status')
    expect(region.textContent).toBe(`${items[0].label} added to the message.`)
  })

  it('a result already in the draft gives feedback instead of silently dropping the query', async () => {
    store.set(chatDraftInputAtom, `${planToken} puis #ref`)
    mount()
    type(`${planToken} puis #ref`)
    await settle()
    key('Enter')
    expect(screen.getByTestId('refs-pick-announcer').textContent).toBe(`${items[0].label} is already in the message.`)
    const note = screen.getByTestId('refs-pick-note')
    expect(note.textContent).toContain('already in the message')
  })
})
