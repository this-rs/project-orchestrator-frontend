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
import { ArrowLeft, Settings } from 'lucide-react'
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
    <div className="flex h-dvh flex-col bg-[var(--bg-primary)]">
      {/* ── Page header ── */}
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4 shrink-0">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-200">Settings</h1>
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6 space-y-6">
          {/* Chat & AI Configuration section */}
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <h2 className="text-sm font-semibold text-gray-300">Chat & AI Configuration</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Permission mode, tool patterns, environment, and Claude Code CLI settings.
              </p>
            </div>
            <div className="[&>div]:border-none">
              <PermissionSettingsPanel />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
