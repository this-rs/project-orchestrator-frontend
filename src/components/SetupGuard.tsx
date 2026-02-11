import { useEffect } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { configExistsAtom, trayNavigationAtom, trayReturnUrlAtom } from '@/atoms/setup'
import { fetchSetupStatus } from '@/services/env'
import { Spinner } from '@/components/ui'

/**
 * Route guard that checks backend setup status on first mount.
 *
 * Calls GET /api/setup-status to check if the backend has been configured.
 * If `configured=false`, redirects to /setup (the setup wizard).
 * If the backend is unreachable or returns an error, assumes configured
 * to avoid blocking the app unnecessarily.
 *
 * When the navigation originated from the system tray (`trayNavigationAtom`
 * is true), the guard respects the user's intent:
 * - If already configured → does NOT redirect, lets the user through.
 * - If NOT configured → saves the intended URL in `trayReturnUrlAtom`
 *   then redirects to /setup. After setup, the wizard redirects back.
 *
 * The result is cached in configExistsAtom so subsequent navigations don't re-fetch.
 */
export function SetupGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [configExists, setConfigExists] = useAtom(configExistsAtom)
  const isTrayNavigation = useAtomValue(trayNavigationAtom)
  const setTrayReturnUrl = useSetAtom(trayReturnUrlAtom)

  useEffect(() => {
    // Skip if already checked
    if (configExists !== null) {
      return
    }

    let cancelled = false

    fetchSetupStatus().then((configured) => {
      if (cancelled) return

      if (configured === null) {
        // Backend not reachable or no setup-status endpoint — assume configured
        setConfigExists(true)
        return
      }

      setConfigExists(configured)

      if (!configured && !location.pathname.startsWith('/setup')) {
        if (isTrayNavigation) {
          // Save the tray's intended destination so the wizard can redirect
          // back after setup completes.
          setTrayReturnUrl(location.pathname + location.search)
        }
        navigate('/setup', { replace: true })
      }
    })

    return () => {
      cancelled = true
    }
  }, [configExists, setConfigExists, navigate, location.pathname, location.search, isTrayNavigation, setTrayReturnUrl])

  // First load: show spinner while checking
  if (configExists === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--surface-base)]">
        <Spinner size="lg" />
      </div>
    )
  }

  return <Outlet />
}
