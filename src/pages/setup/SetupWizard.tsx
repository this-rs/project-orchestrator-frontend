import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { setupStepAtom, setupConfigAtom, configExistsAtom, trayNavigationAtom, OIDC_PROVIDERS, type SetupConfig, type OidcProvider } from '@/atoms/setup'
import { authModeAtom, currentUserAtom } from '@/atoms'
import { fetchSetupStatus, isTauri } from '@/services/env'
import { Spinner } from '@/components/ui'
import { SetupLayout } from './SetupLayout'
import { InfrastructurePage } from './InfrastructurePage'
import { AuthPage } from './AuthPage'
import { ChatPage } from './ChatPage'
import { LaunchPage } from './LaunchPage'

const STEP_COMPONENTS = [InfrastructurePage, AuthPage, ChatPage, LaunchPage]

/**
 * Setup wizard — shown when the backend is not yet configured.
 *
 * On mount, checks /api/setup-status. If already configured (e.g. after
 * app restart post-setup), redirects to the main app instead of showing
 * the wizard again.
 *
 * When the navigation comes from the system tray (`trayNavigationAtom` is
 * true, set via `?from=tray`), the status check is bypassed and the wizard
 * is shown directly — this is the "Reconfigure..." flow. In this mode:
 * - Fields are pre-filled from the existing config.yaml (via Tauri invoke)
 * - Stepper steps are freely clickable
 * - A Close button lets the user return to the main app
 *
 * **Security**: When the backend IS configured and auth IS required, the wizard
 * is only accessible to:
 * - The root account (`is_root: true`)
 * - Navigation from the desktop system tray (Tauri only, local machine)
 * - No-auth mode (auth not configured)
 * - First setup (`configured: false`)
 * All other users are redirected to `/`.
 */
export function SetupWizard() {
  const step = useAtomValue(setupStepAtom)
  const setConfigExists = useSetAtom(configExistsAtom)
  const setSetupConfig = useSetAtom(setupConfigAtom)
  const navigate = useNavigate()
  const isTrayNavigation = useAtomValue(trayNavigationAtom)
  const authMode = useAtomValue(authModeAtom)
  const currentUser = useAtomValue(currentUserAtom)
  const [checking, setChecking] = useState(!isTrayNavigation)
  const [loadingConfig, setLoadingConfig] = useState(isTrayNavigation)

  // ── First setup: check if backend is already configured ────────────
  useEffect(() => {
    if (isTrayNavigation) return

    let cancelled = false

    fetchSetupStatus().then((configured) => {
      if (cancelled) return

      if (configured === true) {
        setConfigExists(true)
        navigate('/', { replace: true })
        return
      }

      // configured === false or null → show the wizard (first setup)
      setChecking(false)
    })

    return () => {
      cancelled = true
    }
  }, [navigate, setConfigExists, isTrayNavigation])

  // ── Reconfigure mode: pre-fill from existing config.yaml ───────────
  useEffect(() => {
    if (!isTrayNavigation) return

    let cancelled = false

    ;(async () => {
      try {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core')
          const existing = await invoke<Record<string, unknown>>('read_config')
          if (cancelled) return

          // Resolve OIDC provider from backend response
          const rawOidcProvider = (existing.oidcProvider as string) || 'custom'
          const oidcProvider: OidcProvider = (
            Object.keys(OIDC_PROVIDERS).includes(rawOidcProvider)
              ? rawOidcProvider
              : 'custom'
          ) as OidcProvider

          // Map the Tauri response to our SetupConfig shape
          setSetupConfig((prev) => ({
            ...prev,
            // Infrastructure
            infraMode: (existing.infraMode as string) === 'external' ? 'external' : 'docker',
            neo4jUri: (existing.neo4jUri as string) || prev.neo4jUri,
            neo4jUser: (existing.neo4jUser as string) || prev.neo4jUser,
            neo4jPassword: (existing.neo4jPassword as string) || '',
            meilisearchUrl: (existing.meilisearchUrl as string) || prev.meilisearchUrl,
            meilisearchKey: (existing.meilisearchKey as string) || '',
            natsUrl: (existing.natsUrl as string) || prev.natsUrl,
            natsEnabled: existing.natsEnabled as boolean ?? prev.natsEnabled,
            serverPort: (existing.serverPort as number) || prev.serverPort,
            serveFrontend: existing.serveFrontend as boolean ?? prev.serveFrontend,
            publicUrl: (existing.publicUrl as string) || '',
            // Authentication
            authMode: (['none', 'password', 'oidc'].includes(existing.authMode as string)
              ? existing.authMode
              : prev.authMode) as SetupConfig['authMode'],
            rootEmail: (existing.rootEmail as string) || '',
            rootPassword: '',
            oidcProvider,
            oidcTenant: '', // Tenant is not persisted — user re-enters if needed
            oidcDiscoveryUrl: (existing.oidcDiscoveryUrl as string) || '',
            oidcClientId: (existing.oidcClientId as string) || '',
            oidcClientSecret: '',
            oidcProviderName: (existing.oidcProviderName as string) || OIDC_PROVIDERS[oidcProvider]?.label || '',
            oidcScopes: (existing.oidcScopes as string) || prev.oidcScopes,
            oidcAuthEndpoint: (existing.oidcAuthEndpoint as string) || '',
            oidcTokenEndpoint: (existing.oidcTokenEndpoint as string) || '',
            oidcUserinfoEndpoint: (existing.oidcUserinfoEndpoint as string) || '',
            // Access restrictions
            allowedEmailDomain: (existing.allowedEmailDomain as string) || '',
            allowedEmails: (existing.allowedEmails as string) || '',
            // Chat
            chatModel: (existing.chatModel as string) || prev.chatModel,
            chatMaxSessions: (existing.chatMaxSessions as number) || prev.chatMaxSessions,
            // Reconfigure indicators
            hasOidcSecret: (existing.hasOidcSecret as boolean) || false,
            hasNeo4jPassword: (existing.hasNeo4jPassword as boolean) || false,
            hasMeilisearchKey: (existing.hasMeilisearchKey as boolean) || false,
          }))
        }
      } catch (err) {
        // If read_config fails (e.g. no config.yaml), just use defaults
        console.warn('Failed to read existing config:', err)
      } finally {
        if (!cancelled) setLoadingConfig(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isTrayNavigation, setSetupConfig])

  // ── Security gate for reconfigure mode ──────────────────────────────
  if (isTrayNavigation && !checking && !loadingConfig) {
    const isAuthorized =
      isTauri ||
      authMode === 'none' ||
      currentUser?.is_root === true

    if (!isAuthorized) {
      navigate('/', { replace: true })
      return null
    }
  }

  if (checking || loadingConfig) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center" style={{ backgroundColor: 'var(--surface-base)' }}>
        <Spinner size="lg" />
      </div>
    )
  }

  const StepComponent = STEP_COMPONENTS[step] || InfrastructurePage
  const isLaunchStep = step === 3

  return (
    <SetupLayout
      hideNav={isLaunchStep}
      freeNavigation={isTrayNavigation}
      showClose={isTrayNavigation}
    >
      <StepComponent />
    </SetupLayout>
  )
}
