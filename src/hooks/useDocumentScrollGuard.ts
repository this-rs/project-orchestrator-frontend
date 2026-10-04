import { useEffect } from 'react'
import { isEditableFocused } from './useVisualViewportHeight'

/**
 * The document itself never scrolls in this app: `body` is `overflow: hidden`
 * and every scroller lives inside the shell. A non-zero window scroll is
 * therefore always a stray one — the whole site sits shifted up, with an
 * empty band underneath that the user cannot scroll back (there is nothing
 * to scroll).
 *
 * How it happens: `overflow: hidden` only blocks USER scrolling. The browser
 * still scrolls the document on its own to reveal a focused field, and iOS
 * does it when the keyboard opens — then does not always undo it when the
 * keyboard closes.
 *
 * This puts the document back at 0, and only when no text field has the
 * focus: while the keyboard is up the OS owns the pan and must not be fought
 * (countering it stutters — tried and reverted, see useVisualViewportHeight).
 */
export function useDocumentScrollGuard(): void {
  useEffect(() => {
    let timer = 0
    const restore = () => {
      if (isEditableFocused()) return
      if (window.scrollX === 0 && window.scrollY === 0) return
      // 'instant': `html { scroll-behavior: smooth }` would animate the way back.
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
    // focusout fires before the next element takes the focus (moving from one
    // field to another must not count as "keyboard closed"): decide a tick later.
    const onFocusOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(restore, 0)
    }
    const vv = window.visualViewport
    window.addEventListener('scroll', restore, { passive: true })
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', restore)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', restore)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', restore)
    }
  }, [])
}
