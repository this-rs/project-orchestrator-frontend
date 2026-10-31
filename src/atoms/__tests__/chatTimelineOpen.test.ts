import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'jotai'
import { CHAT_TIMELINE_OPEN_KEY, chatTimelineOpenAtom } from '@/atoms/chat'

/**
 * The timeline's open state is PER TAB. `localStorage` is shared by every tab of
 * the origin, so a timeline opened in one tab used to show up opened in all of
 * them; the state now lives in `sessionStorage`. The observable contract is the
 * write target: nothing may reach `localStorage`, or tabs start sharing again.
 */
describe('the timeline open state is per tab', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('writes the open state to sessionStorage and never to localStorage', () => {
    const store = createStore()
    store.set(chatTimelineOpenAtom, true)

    expect(sessionStorage.getItem(CHAT_TIMELINE_OPEN_KEY)).toBe('true')
    // The cross-tab channel stays untouched: another tab cannot see this choice.
    expect(localStorage.getItem(CHAT_TIMELINE_OPEN_KEY)).toBeNull()
  })

  it('closing it again touches neither store beyond sessionStorage', () => {
    const store = createStore()
    store.set(chatTimelineOpenAtom, true)
    store.set(chatTimelineOpenAtom, false)

    expect(sessionStorage.getItem(CHAT_TIMELINE_OPEN_KEY)).toBe('false')
    expect(localStorage.getItem(CHAT_TIMELINE_OPEN_KEY)).toBeNull()
  })
})
