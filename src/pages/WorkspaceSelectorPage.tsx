import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { AlertTriangle, Hash, Plus } from 'lucide-react'
import { workspacesAtom } from '@/atoms'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import { Button, EntityList, EntityListSkeleton, EntityRow, ErrorState, Fact, Input, RelativeTime, focusRing } from '@/components/ui'
import type { Workspace } from '@/types'

/** Full-screen centred column (this page renders outside MainLayout: it owns its gutters). */
function Screen({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-dvh flex items-start sm:items-center justify-center bg-surface-base px-4 py-10">
      <div className={`w-full ${narrow ? 'max-w-sm' : 'max-w-md'} space-y-6`}>{children}</div>
    </div>
  )
}

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
  const setWorkspacesAtom = useSetAtom(workspacesAtom)
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

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  // If only one workspace exists, redirect immediately
  useEffect(() => {
    if (!loading && workspaces.length === 1) {
      navigate(workspacePath(workspaces[0].slug, '/overview'), { replace: true })
    }
  }, [loading, workspaces, navigate])

  const header = (
    <div className="text-center space-y-2">
      <img src="/logo-32.png" alt="PO" className="w-10 h-10 mx-auto rounded-xl" />
      <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-100">Select a workspace</h1>
      <p className="text-sm text-gray-500">Choose which workspace to work in</p>
    </div>
  )

  if (loading) {
    return (
      <Screen>
        {header}
        <div aria-busy="true" aria-label="Loading workspaces">
          <EntityListSkeleton rows={3} />
        </div>
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen>
        <ErrorState title="Connection error" description={error} onRetry={loadWorkspaces} />
      </Screen>
    )
  }

  if (workspaces.length === 0) {
    return <EmptyWorkspaceOnboarding navigate={navigate} setWorkspacesAtom={setWorkspacesAtom} />
  }

  return (
    <Screen>
      {header}

      {notFoundSlug && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/20 px-3 py-2.5 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words">
            Workspace <span className="font-medium">&quot;{notFoundSlug}&quot;</span> was not found. Please select another workspace.
          </p>
        </div>
      )}

      <EntityList aria-label="Workspaces">
        {workspaces.map((ws) => (
          <EntityRow
            key={ws.id}
            title={ws.name}
            onClick={() => navigate(workspacePath(ws.slug, '/overview'), { replace: true })}
            leading={
              <span
                aria-hidden="true"
                className="flex w-8 h-8 -my-1.5 items-center justify-center rounded-lg bg-white/[0.06] text-sm font-semibold text-gray-300"
              >
                {ws.name.charAt(0).toUpperCase()}
              </span>
            }
            description={ws.description || undefined}
            trailing={ws.updated_at ? <RelativeTime date={ws.updated_at} prefix="updated " /> : undefined}
            meta={[
              <Fact key="slug" icon={Hash} mono>
                {ws.slug}
              </Fact>,
            ]}
            chevron
          />
        ))}
      </EntityList>

      <InlineCreateWorkspace navigate={navigate} setWorkspacesAtom={setWorkspacesAtom} />
    </Screen>
  )
}

/** Shared create-workspace submit logic. */
function useCreateWorkspace(
  navigate: ReturnType<typeof useNavigate>,
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void,
) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    try {
      const ws = await workspacesApi.create({ name: trimmed })
      // Optimistic update: add to global atom so WorkspaceRouteGuard finds it
      setWorkspacesAtom((prev) => [...prev, ws])
      navigate(workspacePath(ws.slug, '/overview'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
      setCreating(false)
    }
  }

  const reset = () => {
    setName('')
    setError(null)
  }

  return { name, setName, creating, error, handleCreate, reset }
}

/**
 * Collapsible inline form to create a new workspace from the selector page.
 */
function InlineCreateWorkspace({
  navigate,
  setWorkspacesAtom,
}: {
  navigate: ReturnType<typeof useNavigate>
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { name, setName, creating, error, handleCreate, reset } = useCreateWorkspace(navigate, setWorkspacesAtom)

  useEffect(() => {
    if (showForm) inputRef.current?.focus()
  }, [showForm])

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={`w-full min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-white/[0.1] text-sm text-gray-400 transition-colors hover:border-indigo-500/40 hover:text-indigo-300 ${focusRing}`}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Create new workspace
      </button>
    )
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <Input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        aria-label="Workspace name"
        disabled={creating}
        error={error ?? undefined}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setShowForm(false)
            reset()
          }}
          disabled={creating}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={creating || !name.trim()} loading={creating}>
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Onboarding screen for first-time users with no workspaces.
 * Shows a friendly welcome message and inline workspace creation form.
 */
function EmptyWorkspaceOnboarding({
  navigate,
  setWorkspacesAtom,
}: {
  navigate: ReturnType<typeof useNavigate>
  setWorkspacesAtom: (fn: (prev: Workspace[]) => Workspace[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { name, setName, creating, error, handleCreate } = useCreateWorkspace(navigate, setWorkspacesAtom)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <Screen narrow>
      <div className="text-center space-y-2">
        <img src="/logo-32.png" alt="PO" className="w-14 h-14 mx-auto rounded-2xl" />
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-100">Welcome to Project Orchestrator</h1>
        <p className="text-sm text-gray-400">Create your first workspace to get started.</p>
      </div>

      <form onSubmit={handleCreate} className="space-y-3">
        <Input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Workspace"
          aria-label="Workspace name"
          disabled={creating}
          error={error ?? undefined}
        />
        <Button type="submit" className="w-full" disabled={creating || !name.trim()} loading={creating}>
          {creating ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
    </Screen>
  )
}
