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

/**
 * Geometry of the visible viewport while the on-screen keyboard is open —
 * `undefined` whenever no compensation is needed.
 *
 * Why: iOS Safari/WKWebView never shrinks the LAYOUT viewport when the
 * keyboard opens — only the *visual* viewport shrinks (and PANS, see
 * offsetTop). A `position: fixed; top-0 bottom-0` container (ChatPanel)
 * keeps its full pre-keyboard height, so its bottom-anchored input bar ends
 * up hidden behind the keyboard with dead space around it. `dvh` units do
 * NOT account for the keyboard either. The only reliable signal is
 * `window.visualViewport`.
 *
 * Android Chrome is handled declaratively via
 * `interactive-widget=resizes-content` in the viewport meta tag; with it,
 * the layout viewport resizes and the ratio guard below keeps this hook
 * inert (no double compensation).
 *
 * Behavior:
 * - returns `undefined` when the API is missing (SSR, old browsers, Tauri
 *   desktop) or when the visual viewport ≈ layout viewport (no keyboard) —
 *   callers then keep their pure-CSS layout;
 * - returns `{ height, offsetTop }` only when the visual viewport is
 *   meaningfully smaller than the layout viewport (keyboard open).
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
      // Keyboard heuristic: visual viewport at least 100px / 15% smaller
      // than the layout viewport. Plain URL-bar retraction stays well under
      // this threshold; soft keyboards are 250-450px tall (iPhone & iPad).
      const layoutHeight = window.innerHeight
      const gap = layoutHeight - vv.height
      if (gap > Math.max(100, layoutHeight * 0.15)) {
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
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])

  return box
}
