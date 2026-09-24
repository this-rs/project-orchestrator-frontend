/**
 * SettingsPage — Tauri-only dedicated settings page.
 *
 * Accessible from the system tray menu ("Settings...") and from the user menu.
 * Embeds the PermissionSettingsPanel (Chat & AI configuration) as a standalone
 * section without the panel header/close button.
 *
 * This page is NOT shown in web mode — navigating to /settings in a browser
 * redirects to the root.
 *
 * ## Back navigation
 *
 * The back button uses an explicit URL instead of `navigate(-1)` because the
 * page can be opened from the system tray via `pushState`, which may not have
 * prior browser history. The return URL comes from:
 * 1. `settingsReturnUrlAtom` — set by UserMenu before navigating here
 * 2. `sessionStorage['settings_return_url']` — set by the tray handler in Rust
 * 3. Fallback: `/` (which redirects to the last workspace via RootRedirect)
 */

import { useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAtom, useAtomValue } from 'jotai'
import { ArrowLeft } from 'lucide-react'
import { PageContainer, PageHeader, Section, focusRing, surface } from '@/components/ui'
import { isTauri } from '@/services/env'
import { PermissionSettingsPanel } from '@/components/chat/PermissionSettingsPanel'
import { settingsReturnUrlAtom } from '@/atoms/setup'
import { activeWorkspaceSlugAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'

export function SettingsPage() {
  const navigate = useNavigate()
  const [returnUrl, setReturnUrl] = useAtom(settingsReturnUrlAtom)
  const lastSlug = useAtomValue(activeWorkspaceSlugAtom)

  const handleBack = useCallback(() => {
    // 1. Jotai atom (set by UserMenu)
    if (returnUrl) {
      setReturnUrl(null)
      navigate(returnUrl)
      return
    }

    // 2. sessionStorage (set by tray handler in Rust)
    const stored = sessionStorage.getItem('settings_return_url')
    if (stored) {
      sessionStorage.removeItem('settings_return_url')
      navigate(stored)
      return
    }

    // 3. Last workspace
    if (lastSlug) {
      navigate(workspacePath(lastSlug, '/overview'))
      return
    }

    // 4. Root fallback (RootRedirect will handle it)
    navigate('/')
  }, [returnUrl, setReturnUrl, lastSlug, navigate])

  // Guard: only available in Tauri desktop app
  if (!isTauri) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      {/* Not inside MainLayout → provide the standard 16px / 24px gutters here */}
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleBack}
              className={`-ml-2 inline-flex items-center gap-1.5 h-9 px-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] ${focusRing}`}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </button>
            <PageHeader
              title="Settings"
              description="Réglages de l'application de bureau. Ils s'appliquent à toutes les conversations avec les agents."
            />
          </div>

          <Section
            title="Chat & AI"
            description="Mode de permission, outils autorisés ou interdits, variables d'environnement et CLI Claude Code utilisée par les agents."
          >
            <div className={`${surface} overflow-hidden [&>div]:border-none`}>
              <PermissionSettingsPanel />
            </div>
          </Section>
        </PageContainer>
      </div>
    </div>
  )
}
