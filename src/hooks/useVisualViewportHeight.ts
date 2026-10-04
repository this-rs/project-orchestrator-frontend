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
export function isEditableFocused(): boolean {
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
 * - events (vv resize/scroll, window resize, focusin/out) plus a per-frame
 *   read for as long as a field has the focus. WebKit does not reliably
 *   deliver vv events while it pans the page under the keyboard, and every
 *   frame spent on a stale height is a frame where the panel stops short of
 *   the keyboard and the page shows through underneath (a 300ms poll left
 *   that band visible for up to 300ms each time). The loop stops by itself
 *   when the focus leaves the field;
 * - a pinch-zoomed page is not a keyboard: the visual viewport is measured
 *   at scale 1 (`height * scale`), so zooming never shortens the panel.
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
      // vv.height is in CSS px of the ZOOMED page: bring it back to scale 1.
      const scale = vv.scale || 1
      const gap = layoutHeight - vv.height * scale
      // Keyboard = editable focused AND a meaningful shrink. Without focus
      // there is no keyboard — never pin (prevents a stuck short panel).
      if (isEditableFocused() && gap > 100 && Math.abs(scale - 1) < 0.01) {
        const height = Math.round(vv.offsetTop + vv.height)
        setBox((prev) => (prev && prev.height === height ? prev : { height }))
      } else {
        setBox(undefined)
      }
    }

    // Per-frame tracking, alive only while a field has the focus (the only
    // time a keyboard can be up). Reading two numbers per frame is free, and
    // `setBox` keeps the same object when the height did not change.
    let frame = 0
    const track = () => {
      update()
      frame = isEditableFocused() ? requestAnimationFrame(track) : 0
    }
    const onSignal = () => {
      update()
      if (frame === 0 && isEditableFocused()) frame = requestAnimationFrame(track)
    }

    onSignal()
    vv.addEventListener('resize', onSignal)
    vv.addEventListener('scroll', onSignal)
    window.addEventListener('resize', onSignal)
    document.addEventListener('focusin', onSignal)
    document.addEventListener('focusout', onSignal)
    return () => {
      vv.removeEventListener('resize', onSignal)
      vv.removeEventListener('scroll', onSignal)
      window.removeEventListener('resize', onSignal)
      document.removeEventListener('focusin', onSignal)
      document.removeEventListener('focusout', onSignal)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [enabled])

  return box
}
