import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

/** Distance (px) from the bottom under which the reader counts as "following" the conversation. */
const NEAR_BOTTOM_PX = 120

/**
 * Keeps a scroller glued to its bottom while content grows — but only while
 * the reader is already there.
 *
 * The pinned state is read from the reader's own scrolling (the `scroll`
 * event), BEFORE new content lands. Measuring after the content grew is too
 * late in both directions: a big first batch looks "far from the bottom" and
 * never gets followed, and an unconditional `scrollTop = scrollHeight` yanks
 * a reader who scrolled up to read older messages on every new message.
 *
 * `contentKey` is whatever changes when the content grows (message count,
 * the messages array…).
 */
export function useStickToBottom<T extends HTMLElement>(
  contentKey: unknown,
): { scrollRef: RefObject<T | null>; scrollToBottom: (behavior?: ScrollBehavior) => void } {
  const scrollRef = useRef<T | null>(null)
  // A conversation opens at its end: pinned until the reader scrolls away.
  const pinnedRef = useRef(true)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Layout effect: pin in the same commit as the new content, before paint.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [contentKey])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  return { scrollRef, scrollToBottom }
}
