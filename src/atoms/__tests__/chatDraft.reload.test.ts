import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createStore } from 'jotai'
import { chatDraftInputAtom, chatSessionIdAtom } from '@/atoms/chat'

/**
 * The regression in the words of the bug, using only what existed before the
 * fix: type in a conversation, reload the page, the text must still be there.
 */
describe('a draft survives a page reload', () => {
  beforeEach(() => localStorage.clear())

  it('restores the text typed in a conversation after the page is reloaded', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'conv-a')
    store.set(chatDraftInputAtom, 'not sent yet')

    vi.resetModules()
    const reloaded = await import('@/atoms/chat')
    const page = createStore()
    page.set(reloaded.chatSessionIdAtom, 'conv-a')
    expect(page.get(reloaded.chatDraftInputAtom)).toBe('not sent yet')
  })

  it('does not show the draft of one conversation in another', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'conv-a')
    store.set(chatDraftInputAtom, 'for A only')
    store.set(chatSessionIdAtom, 'conv-b')
    expect(store.get(chatDraftInputAtom)).toBe('')
  })
})
