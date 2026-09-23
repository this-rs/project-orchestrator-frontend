import { useEffect, useState } from 'react'

/** Geometry of the keyboard-shrunk visual viewport. */
export interface VisualViewportBox {
  /**
   * Height (px) the fixed panel should take, measured from the TOP of the
   * layout viewport: visualViewport.offsetTop + visualViewport.height.
   *
   * Rationale: iOS pans the visual viewport (offsetTop) to reveal the
   * focused field, and FIGHTING that pan is a losing game — countering it
   * with scrollTo() stutters, chasing it with `top:` drifts (both were
   * tried and reverted). Instead the panel passively COVERS the whole
   * range [0, offsetTop + height]: its bottom edge then coincides with the
   * top of the keyboard wherever the pan settles, with no scroll
   * manipulation at all. The area above offsetTop is simply offscreen
   * panel content.
   */
  height: number
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
 * Panel height while the on-screen keyboard is open — `undefined` whenever
 * no compensation is needed (callers keep their pure-CSS layout).
 *
 * Why: on iOS/iPadOS (every browser there is WebKit — Chrome included, so
 * the meta-tag `interactive-widget=resizes-content` is ignored), the LAYOUT
 * viewport never shrinks for the keyboard: only the *visual* viewport
 * shrinks and pans. A `position: fixed; top-0 bottom-0` container keeps its
 * full pre-keyboard height, leaving dead space between its bottom-anchored
 * input bar and the keyboard.
 *
 * Guards against stale pinning (a shrunk panel with the keyboard closed):
 * - compensation requires BOTH an editable element focused AND a
 *   significant viewport gap — no focus, no pinning, period;
 * - events (vv resize/scroll, window resize, focusin/out) plus a 300ms
 *   polling safety net (WebKit event delivery is flaky) converge the state
 *   quickly in both directions.
 *
 * Android Chrome (Blink) honors `interactive-widget=resizes-content`: its
 * layout viewport resizes, the gap stays ≈ 0 and this hook remains inert.
 * Desktop/Tauri: inert.
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
      // Keyboard = editable focused AND a meaningful shrink. Without focus
      // there is no keyboard — never pin (prevents a stuck short panel).
      if (isEditableFocused() && gap > 100) {
        const height = Math.round(vv.offsetTop + vv.height)
        setBox((prev) => (prev && prev.height === height ? prev : { height }))
      } else {
        setBox(undefined)
      }
    }

    update()
    vv.addEventListener('resize', update)
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
