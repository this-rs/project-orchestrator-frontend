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
 * 3. Fallback: `/` (which opens Today via RootRedirect)
 */

import { useCallback } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useAtom, useAtomValue } from 'jotai'
import { ArrowLeft } from 'lucide-react'
import { Button, ConceptIntro, PageContainer, PageHeader, Section, inlineLink, surface } from '@/components/ui'
import { useT } from '@/i18n'
import type { ConceptExplain } from '@/constants/nomenclature'
import { isTauri } from '@/services/env'
import { UpdatesSection } from '@/components/settings/UpdatesSection'
import { PermissionSettingsPanel } from '@/components/chat/PermissionSettingsPanel'
import { settingsReturnUrlAtom } from '@/atoms/setup'
import { activeWorkspaceSlugAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'

/**
 * Settings is a screen, not a concept of the registry: its three lines live here, written with
 * the registry's rules (DESIGN.md § 5 — one sentence each, the product's words, no promise).
 */
function useSettingsExplain(): ConceptExplain {
  const { t } = useT()
  return {
    what: t('settingsPage.settings.explain.what'),
    why: t('settingsPage.settings.explain.why'),
    different: t('settingsPage.settings.explain.different'),
  }
}

export function SettingsPage() {
  const { t } = useT()
  const settingsExplain = useSettingsExplain()
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
            <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('settingsPage.back')}
            </Button>
            <PageHeader
              title={t('settingsPage.settings.title')}
              description={t('settingsPage.settings.description')}
            />
            <ConceptIntro concept={settingsExplain} storageKey="settings" />
          </div>

          <Section
            title={t('settingsPage.settings.chatTitle')}
            description={t('settingsPage.settings.chatDescription')}
          >
            <div className={`${surface} overflow-hidden [&>div]:border-none`}>
              <PermissionSettingsPanel />
            </div>
          </Section>

          <Section title={t('settingsPage.settings.updatesTitle')} description={t('settingsPage.settings.updatesDescription')}>
            <div className={`${surface} overflow-hidden`}>
              <UpdatesSection />
            </div>
          </Section>

          <p className="text-xs text-gray-500">
            {t('settingsPage.settings.providersNote')}{' '}
            <Link to="/providers" className={inlineLink}>
              {t('settingsPage.settings.providersLink')}
            </Link>
          </p>
        </PageContainer>
      </div>
    </div>
  )
}
