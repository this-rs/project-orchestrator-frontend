import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Cleans the `?from=tray` query parameter from the URL after it has been
 * captured by `trayNavigationAtom` (which reads it synchronously at module
 * load time).
 *
 * This hook only handles URL cleanup — the actual detection is done in the
 * atom's initial value so that the flag is available on the very first
 * render, before any useEffect runs.
 *
 * Must be rendered inside `<BrowserRouter>`.
 */
export function useTrayNavigation(): void {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('from') !== 'tray') return

    // Remove ?from=tray from the URL to keep it clean
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('from')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])
}
