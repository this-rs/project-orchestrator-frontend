import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createStore } from 'jotai'
import {
  MAX_STORED_DRAFTS,
  NEW_CONVERSATION_DRAFT_KEY,
  chatDraftInputAtom,
  chatDraftsMapAtom,
  chatSessionIdAtom,
  draftKeyFor,
  moveChatDraftAtom,
} from '@/atoms/chat'

const STORAGE_KEY = 'chat-drafts'
const stored = (): Record<string, string> => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')

/**
 * What a page reload does: the modules are evaluated again, against the
 * storage left by the previous page. A new jotai store alone is not a reload —
 * the stored value is read when the atom is created.
 */
async function reloadPage() {
  vi.resetModules()
  const atoms = await import('@/atoms/chat')
  return { store: createStore(), ...atoms }
}

describe('the composer draft is per conversation and persisted', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps one draft per conversation', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'conv-a')
    store.set(chatDraftInputAtom, 'draft for A')

    store.set(chatSessionIdAtom, 'conv-b')
    expect(store.get(chatDraftInputAtom)).toBe('')
    store.set(chatDraftInputAtom, 'draft for B')

    store.set(chatSessionIdAtom, 'conv-a')
    expect(store.get(chatDraftInputAtom)).toBe('draft for A')
    store.set(chatSessionIdAtom, 'conv-b')
    expect(store.get(chatDraftInputAtom)).toBe('draft for B')
  })

  it('persists every keystroke, so a page reload restores the draft', async () => {
    const beforeReload = createStore()
    beforeReload.set(chatSessionIdAtom, 'conv-a')
    beforeReload.set(chatDraftInputAtom, 'half a sent')
    beforeReload.set(chatDraftInputAtom, 'half a sentence')
    // Written on the keystroke itself — no conversation switch happened, and
    // that used to be the only moment a draft reached storage.
    expect(stored()).toEqual({ 'conv-a': 'half a sentence' })

    const page = await reloadPage()
    page.store.set(page.chatSessionIdAtom, 'conv-a')
    expect(page.store.get(page.chatDraftInputAtom)).toBe('half a sentence')
  })

  it('reads storage before the first write, so a keystroke after reload keeps the other drafts', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'conv-a': 'kept', 'conv-b': 'kept too' }))
    const page = await reloadPage()
    page.store.set(page.chatSessionIdAtom, 'conv-c')
    page.store.set(page.chatDraftInputAtom, 'new')
    expect(stored()).toEqual({ 'conv-a': 'kept', 'conv-b': 'kept too', 'conv-c': 'new' })
  })

  it('keeps the draft of a conversation that has no id yet', async () => {
    const store = createStore()
    expect(draftKeyFor(null)).toBe(NEW_CONVERSATION_DRAFT_KEY)
    store.set(chatDraftInputAtom, 'first message, not sent')
    expect(stored()).toEqual({ [NEW_CONVERSATION_DRAFT_KEY]: 'first message, not sent' })

    const page = await reloadPage()
    expect(page.store.get(page.chatDraftInputAtom)).toBe('first message, not sent')
  })

  it('removes the entry when the composer is emptied, and keeps the text as typed', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'conv-a')
    store.set(chatDraftInputAtom, 'hello ')
    expect(store.get(chatDraftInputAtom)).toBe('hello ') // the trailing space is not eaten
    store.set(chatDraftInputAtom, '')
    expect(stored()).toEqual({})
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('accepts an updater function', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, 'conv-a')
    store.set(chatDraftInputAtom, 'a')
    store.set(chatDraftInputAtom, (prev) => `${prev}b`)
    expect(store.get(chatDraftInputAtom)).toBe('ab')
  })

  it('moves what was typed under the "new" key to the conversation once it has an id', () => {
    const store = createStore()
    store.set(chatDraftInputAtom, 'typed while the id was on its way')
    store.set(moveChatDraftAtom, { from: NEW_CONVERSATION_DRAFT_KEY, to: 'conv-new' })
    store.set(chatSessionIdAtom, 'conv-new')

    expect(store.get(chatDraftInputAtom)).toBe('typed while the id was on its way')
    expect(stored()).toEqual({ 'conv-new': 'typed while the id was on its way' })

    // Nothing typed: nothing to move, nothing created.
    store.set(moveChatDraftAtom, { from: NEW_CONVERSATION_DRAFT_KEY, to: 'conv-other' })
    expect(stored()).toEqual({ 'conv-new': 'typed while the id was on its way' })
  })

  it('does not overwrite a draft already present at the destination of a move', () => {
    const store = createStore()
    store.set(chatDraftsMapAtom, { [NEW_CONVERSATION_DRAFT_KEY]: 'orphan', 'conv-a': 'already there' })
    store.set(moveChatDraftAtom, { from: NEW_CONVERSATION_DRAFT_KEY, to: 'conv-a' })
    expect(stored()).toEqual({ 'conv-a': 'already there' })
  })

  it('caps the number of stored drafts, dropping the least recently edited', () => {
    const store = createStore()
    for (let i = 0; i < MAX_STORED_DRAFTS + 5; i++) {
      store.set(chatSessionIdAtom, `conv-${i}`)
      store.set(chatDraftInputAtom, `draft ${i}`)
    }
    // Editing an old one makes it recent again.
    store.set(chatSessionIdAtom, 'conv-5')
    store.set(chatDraftInputAtom, 'edited')
    store.set(chatSessionIdAtom, 'conv-new')
    store.set(chatDraftInputAtom, 'one more')

    const map = stored()
    expect(Object.keys(map)).toHaveLength(MAX_STORED_DRAFTS)
    expect(map['conv-0']).toBeUndefined()
    expect(map['conv-6']).toBeUndefined() // the oldest left after conv-5 was refreshed
    expect(map['conv-5']).toBe('edited')
    expect(map['conv-new']).toBe('one more')
  })
})
