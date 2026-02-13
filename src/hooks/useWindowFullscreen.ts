import { useState, useEffect, useRef } from 'react'
import { isTauri } from '@/services/env'

/**
 * Detects whether the Tauri window is in native OS fullscreen mode.
 *
 * Returns `false` in web mode or when not fullscreen.
 * Listens for both Tauri resize/move events and native window resize
 * as proxies for fullscreen changes — macOS fullscreen animation
 * fires multiple resize events, so we debounce the check.
 */
export function useWindowFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isTauri) return

    const unlisteners: (() => void)[] = []

    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()

        // Check initial state
        const fs = await win.isFullscreen()
        setIsFullscreen(fs)

        // Debounced fullscreen check — avoids rapid-fire during resize drag
        const checkFullscreen = () => {
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(async () => {
            try {
              const fs = await win.isFullscreen()
              setIsFullscreen(fs)
            } catch { /* ignore */ }
          }, 100)
        }

        // Tauri resize event (primary signal)
        const unResize = await win.onResized(checkFullscreen)
        unlisteners.push(unResize)

        // Tauri move event (fallback — fullscreen also moves the window)
        const unMoved = await win.onMoved(checkFullscreen)
        unlisteners.push(unMoved)

        // Native window resize as extra fallback
        window.addEventListener('resize', checkFullscreen)
        unlisteners.push(() => window.removeEventListener('resize', checkFullscreen))
      } catch {
        // Not in Tauri or API not available — stay false
      }
    })()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unlisteners.forEach((fn) => fn())
    }
  }, [])

  return isFullscreen
}
