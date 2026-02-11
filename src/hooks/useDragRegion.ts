import { useCallback } from 'react'
import { isTauri } from '@/services/env'

/**
 * Returns a `onMouseDown` handler that initiates native window dragging
 * via `getCurrentWindow().startDragging()`.
 *
 * `data-tauri-drag-region` does NOT work when `decorations: false` in Tauri v2.
 * This hook is the recommended workaround — it calls the Tauri JS API directly.
 *
 * Usage:
 * ```tsx
 * const onDragMouseDown = useDragRegion()
 * <header onMouseDown={onDragMouseDown}>...</header>
 * ```
 *
 * On non-Tauri (web) environments, the handler is a no-op.
 */
export function useDragRegion() {
  return useCallback((e: React.MouseEvent) => {
    if (!isTauri) return

    // Only drag on left-click and when clicking directly on the drag region,
    // not on buttons or interactive elements inside it.
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('[role="button"]') ||
      target.closest('[data-no-drag]')
    ) {
      return
    }

    e.preventDefault()

    // Dynamically import to avoid bundling Tauri API in web builds
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().startDragging()
    }).catch(() => {
      // Not in Tauri context — silently ignore
    })
  }, [])
}
