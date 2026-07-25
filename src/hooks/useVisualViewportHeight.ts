import { useEffect, useState } from 'react'

/** Geometry of the keyboard-shrunk visual viewport. */
export interface VisualViewportBox {
  /** Visible height in px (visualViewport.height). */
  height: number
  /**
   * Vertical offset of the visual viewport inside the LAYOUT viewport
   * (visualViewport.offsetTop). iOS/iPadOS PANS the visual viewport to
   * reveal the focused field: compensating only the height leaves a
   * top-anchored fixed panel pinned to layout-top while the visible window
   * slides down — the gap reappears at the bottom. Fixed panels must follow
   * with `top: offsetTop`.
   */
  offsetTop: number
}

/** True when the currently focused element takes text input. */
function isEditableFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'TEXTAREA' ||
    tag === 'INPUT' ||
    (el as HTMLElement).isContentEditable === true
  )
}

/**
 * Geometry of the visible viewport while the on-screen keyboard is open —
 * `undefined` whenever no compensation is needed.
 *
 * Why: on iOS/iPadOS (EVERY browser there is WebKit — Chrome included, so
 * the meta-tag `interactive-widget=resizes-content` is ignored), the LAYOUT
 * viewport never shrinks for the keyboard: only the *visual* viewport
 * shrinks and pans. A `position: fixed; top-0 bottom-0` container
 * (ChatPanel) keeps its full pre-keyboard height, leaving dead space
 * between the input bar and the keyboard. `dvh` does not account for the
 * keyboard either. The only reliable signal is `window.visualViewport`.
 *
 * Reliability measures (WebKit event delivery is historically flaky, and
 * iPad keyboards vary — floating, split, Stage Manager):
 * - listeners on visualViewport resize+scroll AND window resize;
 * - a 300ms polling interval as the safety net while enabled;
 * - the keyboard threshold drops from max(100px, 15%) to 50px whenever an
 *   editable element has focus — a large gap without focus is browser UI,
 *   a modest gap WITH focus is a keyboard.
 *
 * Android Chrome (Blink) honors `interactive-widget=resizes-content`: its
 * layout viewport resizes, the gap stays ≈ 0 and this hook remains inert
 * (no double compensation). Desktop/Tauri: inert (no vv shrink).
 *
 * NOTE for consumers: apply offsetTop via the `top` style, NOT `transform`
 * — ChatPanel's open/close animation lives in Tailwind `translate-x-*`
 * classes and an inline transform would override them.
 */
export function useVisualViewportHeight(enabled: boolean = true): VisualViewportBox | undefined {
  const [box, setBox] = useState<VisualViewportBox | undefined>(undefined)

  useEffect(() => {
    if (!enabled) {
      setBox(undefined)
      return
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const update = () => {
      const layoutHeight = window.innerHeight
      const gap = layoutHeight - vv.height
      const threshold = isEditableFocused()
        ? 50
        : Math.max(100, layoutHeight * 0.15)
      if (gap > threshold) {
        setBox((prev) =>
          prev && prev.height === vv.height && prev.offsetTop === vv.offsetTop
            ? prev
            : { height: vv.height, offsetTop: vv.offsetTop },
        )
      } else {
        setBox(undefined)
      }
    }

    update()
    vv.addEventListener('resize', update)
    // scroll fires when iOS pans the visual viewport over the layout one
    // (focus scroll) — offsetTop must track it or the panel drifts.
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    // Safety net: WebKit does not always deliver vv events around keyboard
    // show/hide. 300ms while the chat is open is negligible.
    const interval = window.setInterval(update, 300)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      window.clearInterval(interval)
    }
  }, [enabled])

  return box
}
