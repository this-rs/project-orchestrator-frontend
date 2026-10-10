import { useLayoutEffect, useState } from 'react'

export interface SheetPlacement {
  /** `bottom` of a `position: fixed` sheet (px, layout viewport): its lower edge rests on the anchor. */
  bottom: number
  /**
   * Tallest the sheet may be (px): the room the VISIBLE area leaves above the anchor (never above
   * its top edge), up to 70% of the visible area — but never less than COMFORT_HEIGHT for that cap.
   */
  maxHeight: number
}

const GAP = 0
/** Kept free between the sheet and the top of the visible area (the sheet must look like a sheet). */
const EDGE = 8
/** Header (~52px) + two 44px rows: below that a sheet is useless, whatever the room. */
const MIN_HEIGHT = 140
/**
 * The cap never goes under this (header + about eight 44px rows). It used to be half of the
 * visible area: with the keyboard up that is ~200px, minus the header and the status line — one
 * or two rows. The transcript above the composer is of no use while choosing a reference.
 */
const COMFORT_HEIGHT = 420
const VISIBLE_SHARE = 0.7

/**
 * Where a bottom sheet anchored on `anchor` (the composer) goes, from the VISUAL
 * viewport: with the virtual keyboard open the layout viewport may not shrink (iOS) and
 * the visual one is panned, so `innerHeight` alone would put the sheet behind the keys.
 * Recomputed on visualViewport resize/scroll, window resize/scroll and when the anchor
 * changes size (the composer grows with the text). Does nothing while `enabled` is false.
 */
export function useSheetPlacement(anchor: HTMLElement | null, enabled: boolean): SheetPlacement {
  const [placement, setPlacement] = useState<SheetPlacement>({ bottom: 0, maxHeight: 256 })

  useLayoutEffect(() => {
    if (!enabled || !anchor) return
    const vv = window.visualViewport ?? null
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const visibleHeight = vv?.height ?? window.innerHeight
      const visibleTop = vv?.offsetTop ?? 0
      const next = {
        bottom: Math.round(window.innerHeight - rect.top + GAP),
        maxHeight: Math.round(
          Math.max(MIN_HEIGHT, Math.min(rect.top - visibleTop - EDGE, Math.max(COMFORT_HEIGHT, visibleHeight * VISIBLE_SHARE))),
        ),
      }
      setPlacement((prev) => (prev.bottom === next.bottom && prev.maxHeight === next.maxHeight ? prev : next))
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(anchor)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      ro?.disconnect()
    }
  }, [anchor, enabled])

  return placement
}
