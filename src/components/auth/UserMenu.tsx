import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue } from 'jotai'
import { LogOut } from 'lucide-react'
import { authModeAtom, currentUserAtom } from '@/atoms'
import { forceLogout } from '@/services/authManager'

interface UserMenuProps {
  /** Open dropdown upward (for sidebar bottom placement) */
  dropUp?: boolean
  /** Show user name next to avatar (when sidebar is expanded) */
  showName?: boolean
}

export function UserMenu({ dropUp = false, showName = false }: UserMenuProps = {}) {
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

  // Hide in no-auth mode
  if (authMode === 'none') return null

  if (!user) return null

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleLogout = () => {
    forceLogout()
  }

  return (
    <div className="relative" ref={triggerRef}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200 min-w-0"
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
          className="fixed z-50 w-56 rounded-lg glass-heavy py-1 shadow-xl"
          style={menuPos}
        >
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-200">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
          >
            <span className="flex items-center gap-2">
              <LogoutIcon className="h-4 w-4" />
              Sign out
            </span>
            <span className="text-[10px] text-gray-600">v{__APP_VERSION__}</span>
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
