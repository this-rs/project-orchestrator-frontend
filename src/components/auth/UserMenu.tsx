import { useState, useRef, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { authModeAtom, currentUserAtom } from '@/atoms'
import { forceLogout } from '@/services/authManager'

export function UserMenu() {
  const authMode = useAtomValue(authModeAtom)
  const user = useAtomValue(currentUserAtom)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt={user.name}
            className="h-7 w-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">
            {initials}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-white/[0.08] bg-[#1e2130] py-1 shadow-xl">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-200">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
          >
            <LogoutIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}
