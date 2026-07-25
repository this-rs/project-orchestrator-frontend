import { useEffect, useState } from 'react'

/**
 * Height (px) of the visible viewport while the on-screen keyboard is open —
 * `undefined` whenever no compensation is needed.
 *
 * Why: iOS Safari/WKWebView never shrinks the LAYOUT viewport when the
 * keyboard opens — only the *visual* viewport shrinks. A `position: fixed;
 * top-0 bottom-0` container (ChatPanel) keeps its full pre-keyboard height,
 * so its bottom-anchored input bar ends up hidden behind the keyboard and
 * iOS auto-scrolls the page, leaving dead space between the keyboard and
 * the input. `dvh` units do NOT account for the keyboard either (they only
 * track retractable browser UI). The only reliable signal is
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
 * - returns `visualViewport.height` only when the visual viewport is
 *   meaningfully smaller than the layout viewport (keyboard open).
 */
export function useVisualViewportHeight(enabled: boolean = true): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled) {
      setHeight(undefined)
      return
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const update = () => {
      // Keyboard heuristic: visual viewport at least 100px / 15% smaller
      // than the layout viewport. Plain URL-bar retraction stays well under
      // this threshold; soft keyboards are 250-400px tall.
      const layoutHeight = window.innerHeight
      const gap = layoutHeight - vv.height
      if (gap > Math.max(100, layoutHeight * 0.15)) {
        setHeight(vv.height)
      } else {
        setHeight(undefined)
      }
    }

    update()
    vv.addEventListener('resize', update)
    // scroll fires when iOS pans the visual viewport over the layout one
    // (focus scroll) — the offsetTop matters to keep the panel aligned.
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])

  return height
}
