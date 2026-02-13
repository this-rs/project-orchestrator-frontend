import { useState, useEffect, useRef, useCallback } from 'react'
import { isTauri } from '@/services/env'

/**
 * Detects whether the Tauri window is in native OS fullscreen mode.
 *
 * Returns `false` in web mode or when not fullscreen.
 *
 * Uses a multi-signal approach because macOS native fullscreen (via the
 * green traffic light) doesn't always report through Tauri's isFullscreen().
 * We combine:
 * 1. Tauri isFullscreen() API (works for programmatic fullscreen)
 * 2. Screen size comparison (catches macOS native space fullscreen)
 * 3. Multiple event sources (resize, move, native resize) with debounce
 */
export function useWindowFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkFullscreen = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        // Method 1: Compare window size with screen size.
        // In macOS native fullscreen, the window fills the entire screen.
        // Allow 1px tolerance for retina rounding.
        const screenMatch =
          Math.abs(window.innerWidth - screen.width) <= 1 &&
          Math.abs(window.innerHeight - screen.height) <= 1

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
          Math.abs(window.innerWidth - screen.width) <= 1 &&
          Math.abs(window.innerHeight - screen.height) <= 1
        setIsFullscreen(screenMatch)
      }
    }, 150)
  }, [])

  useEffect(() => {
    if (!isTauri) return

    const unlisteners: (() => void)[] = []

    // Check initial state
    checkFullscreen()

    // Listen to multiple event sources
    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        const unResize = await win.onResized(checkFullscreen)
        unlisteners.push(unResize)

        const unMoved = await win.onMoved(checkFullscreen)
        unlisteners.push(unMoved)
      } catch { /* not in Tauri */ }
    })()

    // Native resize as additional signal
    window.addEventListener('resize', checkFullscreen)
    unlisteners.push(() => window.removeEventListener('resize', checkFullscreen))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unlisteners.forEach((fn) => fn())
    }
  }, [checkFullscreen])

  return isFullscreen
}
