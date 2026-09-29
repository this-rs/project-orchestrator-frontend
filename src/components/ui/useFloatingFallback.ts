import { useEffect, type RefObject } from 'react'
import { positionFloating, supportsAnchorPositioning, type MenuPositionOptions } from './menuPosition'

/**
 * For native-popover menus styled with `.popover-dropdown` (CSS anchor
 * positioned): when the browser lacks CSS Anchor Positioning (iOS Safari < 26,
 * Tauri WKWebView), place the menu in JS while it is open and keep it glued
 * to its trigger on scroll / resize. No-op on browsers with anchor support.
 */
export function useFloatingFallback(
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options?: MenuPositionOptions & { matchWidth?: boolean },
): void {
  const align = options?.align
  const matchWidth = options?.matchWidth
  useEffect(() => {
    if (supportsAnchorPositioning || !isOpen) return
    const place = () => {
      if (triggerRef.current && menuRef.current) {
        positionFloating(triggerRef.current, menuRef.current, { align, matchWidth })
      }
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [isOpen, triggerRef, menuRef, align, matchWidth])
}
