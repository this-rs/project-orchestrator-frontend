import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import type { Workspace } from '@/types'

/**
 * Full-page workspace selector shown when:
 * - No workspace slug is in the URL
 * - No previous workspace in localStorage
 * - The stored workspace no longer exists
 */
export function WorkspaceSelectorPage() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workspacesApi
      .list({ limit: 100, sort_by: 'name', sort_order: 'asc' })
      .then((data) => setWorkspaces(data.items || []))
      .finally(() => setLoading(false))
  }, [])

  // If only one workspace exists, redirect immediately
  useEffect(() => {
    if (!loading && workspaces.length === 1) {
      navigate(workspacePath(workspaces[0].slug, '/projects'), { replace: true })
    }
  }, [loading, workspaces, navigate])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f1117]">
        <div className="animate-pulse text-gray-500">Loading workspaces...</div>
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f1117]">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-100">Welcome to Project Orchestrator</h1>
          <p className="text-gray-400">Create your first workspace to get started.</p>
          <button
            onClick={() => {
              // TODO: open create workspace dialog
              navigate('/workspace-selector')
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Create Workspace
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center space-y-2">
          <img src="/logo-32.png" alt="PO" className="w-12 h-12 mx-auto rounded-xl" />
          <h1 className="text-xl font-bold text-gray-100">Select a Workspace</h1>
          <p className="text-sm text-gray-500">Choose which workspace to work in</p>
        </div>

        <div className="space-y-2">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => navigate(workspacePath(ws.slug, '/projects'), { replace: true })}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-lg transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg">
                {ws.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-gray-100 font-medium truncate">{ws.name}</div>
                {ws.description && (
                  <div className="text-sm text-gray-500 truncate">{ws.description}</div>
                )}
              </div>
              <svg className="w-5 h-5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
