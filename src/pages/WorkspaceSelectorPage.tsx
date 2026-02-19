import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import { ErrorState } from '@/components/ui'
import type { Workspace } from '@/types'

/**
 * Full-page workspace selector shown when:
 * - No workspace slug is in the URL
 * - No previous workspace in localStorage
 * - The stored workspace no longer exists
 */
export function WorkspaceSelectorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const notFoundSlug = searchParams.get('notFound')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await workspacesApi.list({ limit: 100, sort_by: 'name', sort_order: 'asc' })
      setWorkspaces(data.items || [])
    } catch {
      setError('Failed to load workspaces. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  // If only one workspace exists, redirect immediately
  useEffect(() => {
    if (!loading && workspaces.length === 1) {
      navigate(workspacePath(workspaces[0].slug, '/projects'), { replace: true })
    }
  }, [loading, workspaces, navigate])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-base">
        <div className="animate-pulse text-gray-500">Loading workspaces...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-base">
        <ErrorState title="Connection error" description={error} onRetry={loadWorkspaces} />
      </div>
    )
  }

  if (workspaces.length === 0) {
    return <EmptyWorkspaceOnboarding navigate={navigate} />
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-base">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center space-y-2">
          <img src="/logo-32.png" alt="PO" className="w-12 h-12 mx-auto rounded-xl" />
          <h1 className="text-xl font-bold text-gray-100">Select a Workspace</h1>
          <p className="text-sm text-gray-500">Choose which workspace to work in</p>
        </div>

        {notFoundSlug && (
          <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-300">
            Workspace <span className="font-medium">&quot;{notFoundSlug}&quot;</span> was not found. Please select another workspace.
          </div>
        )}

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
              <ChevronRight className="w-5 h-5 text-gray-600 shrink-0" />
            </button>
          ))}
        </div>

        <InlineCreateWorkspace navigate={navigate} />
      </div>
    </div>
  )
}

/**
 * Collapsible inline form to create a new workspace from the selector page.
 */
function InlineCreateWorkspace({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showForm) inputRef.current?.focus()
  }, [showForm])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    try {
      const ws = await workspacesApi.create({ name: trimmed })
      navigate(workspacePath(ws.slug, '/projects'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
      setCreating(false)
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-white/[0.1] hover:border-indigo-500/40 rounded-lg transition-colors text-gray-400 hover:text-indigo-400"
      >
        <Plus className="w-5 h-5" />
        Create new workspace
      </button>
    )
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 p-4 bg-white/[0.04] border border-white/[0.06] rounded-lg">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        disabled={creating}
      />
      {error && <div className="text-sm text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setShowForm(false); setName(''); setError(null) }}
          className="flex-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 bg-white/[0.04] rounded-lg transition-colors"
          disabled={creating}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="flex-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  )
}

/**
 * Onboarding screen for first-time users with no workspaces.
 * Shows a friendly welcome message and inline workspace creation form.
 */
function EmptyWorkspaceOnboarding({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    try {
      const ws = await workspacesApi.create({ name: trimmed })
      navigate(workspacePath(ws.slug, '/projects'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
      setCreating(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-base">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <img src="/logo-32.png" alt="PO" className="w-16 h-16 mx-auto rounded-2xl" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-100">Welcome to Project Orchestrator</h1>
          <p className="text-gray-400 text-sm">Create your first workspace to get started.</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workspace"
            className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/[0.1] rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            disabled={creating}
          />
          {error && (
            <div className="text-sm text-red-400">{error}</div>
          )}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {creating ? 'Creating...' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
