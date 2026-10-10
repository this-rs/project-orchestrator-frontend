import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { Cpu, KeyRound, LogOut, Settings } from 'lucide-react'
import { authModeAtom, currentUserAtom } from '@/atoms'
import { clearChatDraftsAtom } from '@/atoms/chat'
import { settingsReturnUrlAtom } from '@/atoms/setup'
import { forceLogout } from '@/services/authManager'
import { isTauri } from '@/services/env'
import { glass, glassButton, glassFlat, popIn } from '@/components/ui/classes'
import { useT } from '@/i18n'
import { menuItemClass } from '@/components/ui/menuPosition'

interface UserMenuProps {
  /** Open dropdown upward (for sidebar bottom placement) */
  dropUp?: boolean
  /** Show user name next to avatar (when sidebar is expanded) */
  showName?: boolean
}

export function UserMenu({ dropUp = false, showName = false }: UserMenuProps = {}) {
  const { t } = useT()
  const authMode = useAtomValue(authModeAtom)
  const user = useAtomValue(currentUserAtom)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null)

  // Compute menu position from the trigger button
  const updateMenuPos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    if (dropUp) {
      setMenuPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left })
    } else {
      setMenuPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 224) })
    }
  }, [dropUp])

  // Update position on open and on resize
  useEffect(() => {
    if (!open) return
    updateMenuPos()
    window.addEventListener('resize', updateMenuPos)
    return () => window.removeEventListener('resize', updateMenuPos)
  }, [open, updateMenuPos])

  // Close dropdown on outside click (check both trigger and portal dropdown)
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const navigate = useNavigate()
  const location = useLocation()
  const setSettingsReturnUrl = useSetAtom(settingsReturnUrlAtom)
  const clearChatDrafts = useSetAtom(clearChatDraftsAtom)

  // Hide in no-auth mode (early returns must come AFTER all hook calls)
  if (authMode === 'none') return null

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleLogout = () => {
    // Unsent chat text is persisted per conversation; it leaves with the user.
    clearChatDrafts()
    forceLogout()
  }

  const handleSettings = () => {
    setOpen(false)
    setSettingsReturnUrl(location.pathname + location.search)
    navigate('/settings')
  }

  return (
    <div className="relative" ref={triggerRef}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={showName ? undefined : t('auth.menu.accountFor', { name: user.name })}
        className={`${glassButton.ghost} ${glassFlat} min-h-9 justify-start gap-2 p-1 font-normal text-gray-400 min-w-0`}
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt={user.name}
            className="h-7 w-7 rounded-full shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white shrink-0">
            {initials}
          </div>
        )}
        {showName && (
          <span className="truncate text-sm text-gray-300">{user.name}</span>
        )}
      </button>

      {/* Portal to escape sidebar stacking context */}
      {open && menuPos && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          aria-label={t('auth.menu.account')}
          className={`fixed z-50 w-56 rounded-xl py-1 ${glass} ${popIn}`}
          style={menuPos}
        >
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-200">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/vault')
            }}
            className={menuItemClass()}
          >
            <KeyRound className="h-4 w-4 text-gray-500" aria-hidden="true" />
            {t('auth.menu.vault')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/providers')
            }}
            className={menuItemClass()}
          >
            <Cpu className="h-4 w-4 text-gray-500" aria-hidden="true" />
            {t('auth.menu.providers')}
          </button>
          {isTauri && (
            <button type="button" role="menuitem" onClick={handleSettings} className={menuItemClass()}>
              <Settings className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('auth.menu.settings')}
            </button>
          )}
          <button type="button" role="menuitem" onClick={handleLogout} className={`${menuItemClass()} justify-between`}>
            <span className="flex items-center gap-2.5">
              <LogoutIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('auth.menu.signOut')}
            </span>
            <span className="text-[11px] tabular-nums text-gray-500">v{__APP_VERSION__}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return <LogOut className={className} />
}
