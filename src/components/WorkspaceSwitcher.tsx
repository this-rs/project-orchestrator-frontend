import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Plus, Menu } from 'lucide-react'
import { workspacesAtom, activeWorkspaceAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'
import { workspacesApi } from '@/services'

/**
 * Dropdown in the sidebar that shows the active workspace
 * and lets the user switch to another one.
 */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const workspaces = useAtomValue(workspacesAtom)
  const setWorkspaces = useSetAtom(workspacesAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // Compute menu position from the trigger button
  const updateMenuPos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: collapsed ? 220 : rect.width,
    })
  }, [collapsed])

  // Update position on open and on scroll/resize
  useEffect(() => {
    if (!open) return
    updateMenuPos()
    window.addEventListener('resize', updateMenuPos)
    return () => window.removeEventListener('resize', updateMenuPos)
  }, [open, updateMenuPos])

  // Close on click outside (check both trigger and portal menu)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false)
        setShowCreate(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!activeWorkspace) return null

  const otherWorkspaces = workspaces.filter((w) => w.slug !== activeWorkspace.slug)

  return (
    <div ref={ref} className="relative px-2 mb-2">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-md bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
          {activeWorkspace.name.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 text-sm font-medium text-gray-200 truncate">
              {activeWorkspace.name}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {/* Dropdown — portal to escape sidebar stacking context */}
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed glass-heavy rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          {otherWorkspaces.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No other workspaces</div>
          ) : (
            otherWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setOpen(false)
                  navigate(workspacePath(ws.slug, '/projects'))
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-gray-400 font-medium text-xs shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-300 truncate">{ws.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-white/[0.06] mt-1 pt-1">
            <button
              onClick={() => {
                setShowCreate(true)
                setTimeout(() => createInputRef.current?.focus(), 0)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors text-left text-sm text-gray-400"
            >
              <Plus className="w-4 h-4" />
              New workspace
            </button>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/workspace-selector')
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors text-left text-sm text-gray-400"
            >
              <Menu className="w-4 h-4" />
              All workspaces
            </button>
          </div>
          {showCreate && (
            <div className="border-t border-white/[0.06] px-3 py-2">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const trimmed = newName.trim()
                  if (!trimmed || creating) return
                  setCreating(true)
                  try {
                    const ws = await workspacesApi.create({ name: trimmed })
                    // Optimistic update: add the new workspace to the atom
                    // so WorkspaceRouteGuard finds it before the WS event arrives
                    setWorkspaces((prev) => [...prev, ws])
                    setOpen(false)
                    setShowCreate(false)
                    setNewName('')
                    navigate(workspacePath(ws.slug, '/projects'))
                  } catch {
                    setCreating(false)
                  }
                }}
                className="flex gap-1.5"
              >
                <input
                  ref={createInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 min-w-0 px-2 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCreate(false)
                      setNewName('')
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shrink-0"
                >
                  {creating ? '...' : 'Create'}
                </button>
              </form>
            </div>
          )}
        </div>,
        document.body,
      )}

    </div>
  )
}
