/**
 * The `#` composer, seen by someone using it: the cap, the keyboard, the
 * announcements. Run with: npx vitest run src/components/chat/ChatInput.ChatInput.refsStale.test.tsx
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

describe('the keyboard while the next search runs', () => {
  it('Enter does not send the message from a stale list', async () => {
    const onSend = vi.fn()
    store.set(chatServerFeaturesAtom, ['refs_v1'])
    render(
      <Provider store={store}>
        <ChatInput onSend={onSend} onQueue={vi.fn()} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
      </Provider>,
    )
    type('#r')
    await settle()
    searchMock.mockImplementation(() => new Promise(() => {}))
    type('#re')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    key('Enter')
    expect(onSend).not.toHaveBeenCalled()
    expect(store.get(chatDraftInputAtom)).toBe('#re')
  })
})
