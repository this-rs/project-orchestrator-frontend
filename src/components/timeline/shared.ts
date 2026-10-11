/**
 * What the two views of a timeline (the span tree, the tracks) have in common:
 * the breakpoints and the small hooks that measure and tick. Their shared
 * components (toolbar button, bottom sheet) are in `sharedUi.tsx`.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Below this width (of the component, not the screen) the view is one column and the detail a bottom sheet. */
export const WIDE_PX = 640
/** From this width the detail sits beside the view. */
export const SIDE_PX = 1100
/**
 * A first load shorter than this shows no skeleton at all: a fast answer goes straight from
 * nothing to the view, without a placeholder blinking in between.
 */
export const SKELETON_DELAY_MS = 180
/** A drag shorter than this is a click. */
export const DRAG_SLOP_PX = 4

/** Width of an element, 0 where it cannot be measured (tests). */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** True once `active` has stayed true for `ms`; false again as soon as it turns false. */
export function useDelayed(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => setElapsed(true), ms)
    return () => {
      window.clearTimeout(id)
      setElapsed(false)
    }
  }, [active, ms])
  return active && elapsed
}

/** A clock that ticks while something runs, and not at all otherwise. */
export function useNow(active: boolean, everyMs = 500): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [active, everyMs])
  return now
}

export const fill = (template: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template)

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
