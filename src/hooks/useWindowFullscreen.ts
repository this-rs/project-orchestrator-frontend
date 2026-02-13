import { useState, useEffect, useRef, useCallback } from 'react'
import { isTauri } from '@/services/env'

/**
 * Detects whether the Tauri window is in native OS fullscreen mode.
 *
 * Returns `false` in web mode or when not fullscreen.
 *
 * Uses a multi-signal approach because macOS native fullscreen (via the
 * green traffic light) doesn't always report through Tauri's isFullscreen().
 *
 * Known Tauri issue: the resize event fires BEFORE isFullscreen() is updated.
 * We work around this with:
 * 1. Screen size comparison (primary — catches native macOS space fullscreen)
 * 2. Tauri isFullscreen() API (fallback — catches programmatic fullscreen)
 * 3. Multiple event sources (resize, move, focus) with staggered debounce
 *    to ensure we catch the state after the animation completes
 */
export function useWindowFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doCheck = useCallback(async () => {
    try {
      // Method 1: Compare window size with screen size.
      // In macOS native fullscreen, the window fills the entire screen.
      // Allow 2px tolerance for retina rounding.
      const screenMatch =
        Math.abs(window.innerWidth - screen.width) <= 2 &&
        Math.abs(window.innerHeight - screen.height) <= 2

      if (screenMatch) {
        setIsFullscreen(true)
        return
      }

      // Method 2: Tauri API (catches programmatic setFullscreen)
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const fs = await getCurrentWindow().isFullscreen()
      setIsFullscreen(fs)
    } catch {
      // Fallback to screen comparison only
      const screenMatch =
        Math.abs(window.innerWidth - screen.width) <= 2 &&
        Math.abs(window.innerHeight - screen.height) <= 2
      setIsFullscreen(screenMatch)
    }
  }, [])

  const scheduleCheck = useCallback(() => {
    // Clear any pending checks
    if (timer1Ref.current) clearTimeout(timer1Ref.current)
    if (timer2Ref.current) clearTimeout(timer2Ref.current)

    // First check after 300ms — animation may still be running
    timer1Ref.current = setTimeout(() => {
      doCheck()
    }, 300)

    // Second check after 800ms — ensures we get the final state
    // after macOS fullscreen animation completes (~750ms)
    timer2Ref.current = setTimeout(() => {
      doCheck()
    }, 800)
  }, [doCheck])

  useEffect(() => {
    if (!isTauri) return

    const unlisteners: (() => void)[] = []

    // Check initial state immediately
    doCheck()

    // Listen to multiple event sources
    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        // Resize fires during fullscreen transitions
        const unResize = await win.onResized(scheduleCheck)
        unlisteners.push(unResize)

        // Window move can fire during transitions too
        const unMoved = await win.onMoved(scheduleCheck)
        unlisteners.push(unMoved)

        // Focus changes during macOS fullscreen space transitions
        const unFocus = await win.onFocusChanged(scheduleCheck)
        unlisteners.push(unFocus)
      } catch { /* not in Tauri */ }
    })()

    // Native resize as additional signal
    window.addEventListener('resize', scheduleCheck)
    unlisteners.push(() => window.removeEventListener('resize', scheduleCheck))

    return () => {
      if (timer1Ref.current) clearTimeout(timer1Ref.current)
      if (timer2Ref.current) clearTimeout(timer2Ref.current)
      unlisteners.forEach((fn) => fn())
    }
  }, [doCheck, scheduleCheck])

  return isFullscreen
}
