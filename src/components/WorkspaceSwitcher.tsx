import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { workspacesAtom, activeWorkspaceAtom } from '@/atoms'
import { workspacePath } from '@/utils/paths'
import { ConfirmDialog } from '@/components/ui'
import { useConfirmDialog, useToast } from '@/hooks'
import { workspacesApi } from '@/services'

/**
 * Dropdown in the sidebar that shows the active workspace
 * and lets the user switch to another one.
 */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const workspaces = useAtomValue(workspacesAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
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
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-[#1e2130] border border-white/[0.08] rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
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
                setOpen(false)
                navigate('/workspace-selector')
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.06] transition-colors text-left text-sm text-gray-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              All workspaces
            </button>
            <button
              onClick={() => {
                setOpen(false)
                confirmDialog.open({
                  title: 'Delete Workspace',
                  description: `This will permanently delete "${activeWorkspace.name}". Projects will not be deleted.`,
                  onConfirm: async () => {
                    await workspacesApi.delete(activeWorkspace.slug)
                    toast.success('Workspace deleted')
                    navigate('/workspace-selector')
                  },
                })
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 transition-colors text-left text-sm text-red-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete workspace
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
