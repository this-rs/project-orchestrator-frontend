import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { trayNavigationAtom } from '@/atoms/setup'

/**
 * Captures the tray's navigation intent and drives `trayNavigationAtom`.
 *
 * The atom's module-load initializer only sees `?from=tray` when the app boots
 * on that URL (a full reload). The desktop tray now navigates INSIDE the SPA
 * (`history.pushState`), so the param appears after the module has already
 * loaded: this hook sets the atom reactively from the current search params,
 * then removes `?from=tray` to keep the URL clean.
 *
 * When the app leaves the setup wizard without a fresh tray signal, the atom is
 * reset so a later plain `/setup` visit (e.g. the first-run SetupGuard redirect)
 * is not mistaken for a tray reconfigure.
 *
 * Must be rendered inside `<BrowserRouter>`.
 */
export function useTrayNavigation(): void {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const setTrayNavigation = useSetAtom(trayNavigationAtom)

  useEffect(() => {
    const fromTray = searchParams.get('from') === 'tray'

    if (fromTray) {
      setTrayNavigation(true)
      // Remove ?from=tray from the URL to keep it clean
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('from')
          return next
        },
        { replace: true },
      )
      return
    }

    if (location.pathname !== '/setup') {
      // Left the wizard without a fresh tray signal: the intent is consumed.
      setTrayNavigation(false)
    }
  }, [searchParams, location.pathname, setSearchParams, setTrayNavigation])
}
